import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import path from 'path'
import sharp from 'sharp'
import { Readable } from 'stream'
import { Repository } from 'typeorm'
import { appConfig } from '../../config/app-config'
import { AttachmentEntity } from '../../db/entities/attachment.entity'
import { s3Client } from '../../utils/s3-client'
import { GetAttachmentFileParamsDto } from './dto/get-attachment-file.dto'

@Injectable()
export class AttachmentService {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>
  ) {}

  async uploadFile(file: Express.Multer.File): Promise<AttachmentEntity> {
    if (!file) {
      throw new BadRequestException('No file provided')
    }

    // You can customize the upload path/logic here
    const originalFileName = file.originalname
    const originalFileExtension = originalFileName.split('.').pop() || ''
    const onlyFileName = originalFileName.split('.').slice(0, -1).join('.')
    let fileName = originalFileName

    if (['jpg', 'jpeg', 'png'].includes(originalFileExtension)) {
      fileName = onlyFileName + '.png'
    }

    const mimeType = file.mimetype
    const size = file.size

    let body = file.buffer
    const s3key = path.join('uploads', fileName)

    if (mimeType.includes('image/')) {
      body = await sharp(file.buffer)
        .resize({
          width: 1200,
          withoutEnlargement: true,
        })
        .png({
          quality: 80,
        })
        .toBuffer()

      const thumbnailKey = path.join('uploads', onlyFileName + '-thumbnail' + originalFileExtension)
      const thumbnailBody = await sharp(body)
        .resize({
          width: 100,
          height: 100,
        })
        .toBuffer()

      await s3Client.send(
        new PutObjectCommand({
          Bucket: appConfig.AWS_BUCKET_NAME,
          Key: thumbnailKey,
          Body: thumbnailBody,
        })
      )
    }

    await s3Client.send(
      new PutObjectCommand({
        Bucket: appConfig.AWS_BUCKET_NAME,
        Key: s3key,
        Body: body,
      })
    )

    const attachment = this.attachmentRepository.create({
      fileName,
      filePath: s3key,
      mimeType: 'image/png',
      size,
    })

    return this.attachmentRepository.save(attachment)
  }

  async getAttachmentsByAttachable(
    attachableId: string,
    attachableType: string
  ): Promise<AttachmentEntity[]> {
    return this.attachmentRepository.find({
      where: {
        attachableId,
        attachableType,
      },
      order: {
        createdAt: 'DESC',
      },
    })
  }

  async getAttachment(id: string): Promise<AttachmentEntity | null> {
    return this.attachmentRepository.findOne({
      where: { id },
    })
  }

  async getAttachmentFile(id: string) {
    const attachment = await this.getAttachment(id)
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    const s3key = attachment.filePath

    const head = await s3Client.send(
      new HeadObjectCommand({
        Bucket: appConfig.AWS_BUCKET_NAME,
        Key: s3key,
      })
    )

    const getObjectCommand = new GetObjectCommand({
      Bucket: appConfig.AWS_BUCKET_NAME,
      Key: s3key,
    })
    const object = await s3Client.send(getObjectCommand)

    const readableStream = object.Body?.transformToWebStream()

    const readable = Readable.from(readableStream as unknown as ReadableStream)

    return {
      contentType: attachment.mimeType,
      filename: decodeURIComponent(attachment.fileName),
      readable,
      contentLength: head.ContentLength,
    }
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.attachmentRepository.softDelete(id)
  }

  async getAttachmentFilePresignedUrl(id: string, params: GetAttachmentFileParamsDto) {
    const attachment = await this.getAttachment(id)
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    let s3key = attachment.filePath
    if (params.thumbnail) {
      s3key = s3key.replace('.png', '-thumbnail.png')
    }

    try {
      const head = await s3Client.send(
        new HeadObjectCommand({
          Bucket: appConfig.AWS_BUCKET_NAME,
          Key: s3key,
        })
      )

      if (!head) {
        throw new NotFoundException('Attachment not found')
      }
    } catch {
      const originFile = await s3Client.send(
        new GetObjectCommand({
          Bucket: appConfig.AWS_BUCKET_NAME,
          Key: attachment.filePath,
        })
      )
      const originFileBuffer = await originFile.Body?.transformToByteArray()

      const thumbnailBody = await sharp(originFileBuffer)
        .resize({
          width: 100,
          height: 100,
        })
        .toBuffer()

      await s3Client.send(
        new PutObjectCommand({
          Bucket: appConfig.AWS_BUCKET_NAME,
          Key: s3key,
          Body: thumbnailBody,
        })
      )
    }

    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: appConfig.AWS_BUCKET_NAME,
        Key: s3key,
      }),
      { expiresIn: 5 * 60 }
    )

    return presignedUrl
  }
}

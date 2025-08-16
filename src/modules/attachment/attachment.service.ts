import { GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import path from 'path'
import sharp from 'sharp'
import { Readable } from 'stream'
import { Repository } from 'typeorm'
import { appConfig } from '../../config/app-config'
import { AttachmentEntity } from '../../db/entities/attachment.entity'
import { s3Client } from '../../utils/s3-client'

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
    let fileName = originalFileName
    if (['jpg', 'jpeg', 'png'].includes(originalFileExtension)) {
      fileName = originalFileName.replace(`.${originalFileExtension}`, '.png')
    }

    const mimeType = file.mimetype
    const size = file.size

    let body = file.buffer

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
    }

    const s3key = path.join('uploads', fileName)
    const uploadResult = await s3Client.send(
      new PutObjectCommand({
        Bucket: appConfig.AWS_BUCKET_NAME,
        Key: s3key,
        Body: body,
      })
    )

    console.log(uploadResult)

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
}

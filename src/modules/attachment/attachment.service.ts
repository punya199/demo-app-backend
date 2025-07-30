import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AttachmentEntity } from '../../entities/attachment.entity'

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
    const fileName = file.originalname
    const filePath = file.path
    // const filePath = `/private/uploads/${Date.now()}-${fileName}`
    const mimeType = file.mimetype
    const size = file.size

    const attachment = this.attachmentRepository.create({
      fileName,
      filePath,
      mimeType,
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

  async deleteAttachment(id: string): Promise<void> {
    await this.attachmentRepository.softDelete(id)
  }
}

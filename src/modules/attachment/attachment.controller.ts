import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request, Response } from 'express'
import { appConfig } from '../../config/app-config'
import { UserRole } from '../../db/entities/user.entity'
import { AuthUser } from '../auth/auth.decorator'
import { AttachmentService } from './attachment.service'
import { GetAttachmentFileParamsDto } from './dto/get-attachment-file.dto'

@Controller('attachments')
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @AuthUser(UserRole.ADMIN)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        if (file.mimetype.includes('image/') || file.mimetype === 'application/pdf') {
          callback(null, true)
        } else {
          callback(new BadRequestException('File must be an image or a PDF'), false)
        }
      },
      limits: {
        fileSize: appConfig.ATTACHMENT_MAX_FILE_SIZE_MB * 1024 * 1024,
      },
    })
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided')
    }

    return this.attachmentService.uploadFile(file)
  }

  @AuthUser()
  @Get()
  async getAttachments(
    @Query('attachableId') attachableId: string,
    @Query('attachableType') attachableType: string
  ) {
    if (!attachableId || !attachableType) {
      throw new BadRequestException('attachableId and attachableType are required')
    }

    return this.attachmentService.getAttachmentsByAttachable(attachableId, attachableType)
  }

  @AuthUser()
  @Get(':id')
  async getAttachment(@Param('id') id: string) {
    return this.attachmentService.getAttachment(id)
  }

  @Get(':id/file')
  async getAttachmentFile(
    @Param('id') id: string,
    @Query() query: GetAttachmentFileParamsDto,
    @Res() res: Response
  ) {
    const presignedUrl = await this.attachmentService.getAttachmentFilePresignedUrl(id, query)

    res.redirect(HttpStatus.TEMPORARY_REDIRECT, presignedUrl)
  }

  @AuthUser(UserRole.ADMIN)
  @Delete(':id')
  async deleteAttachment(@Param('id') id: string) {
    await this.attachmentService.deleteAttachment(id)
    return { message: 'Attachment deleted successfully' }
  }
}

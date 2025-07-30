import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Request, Response } from 'express'
import { diskStorage } from 'multer'
import { extname } from 'path'
import { AuthUser } from '../user/user.decorator'
import { AttachmentService } from './attachment.service'

@Controller('attachments')
export class AttachmentController {
  constructor(private readonly attachmentService: AttachmentService) {}

  @AuthUser()
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './private/uploads',
        filename: (
          req: Request,
          file: Express.Multer.File,
          callback: (error: Error | null, filename: string) => void
        ) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
          const ext = extname(file.originalname)
          const filename = `${uniqueSuffix}${ext}`
          callback(null, filename)
        },
      }),
      fileFilter: (
        req: Request,
        file: Express.Multer.File,
        callback: (error: Error | null, acceptFile: boolean) => void
      ) => {
        // Add file type validation if needed
        // For now, accept all file types
        callback(null, true)
      },
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
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

  // @AuthUser()
  @Get(':id/file')
  async getAttachmentFile(@Param('id') id: string, @Res() res: Response) {
    const attachment = await this.attachmentService.getAttachment(id)
    if (!attachment) {
      throw new NotFoundException('Attachment not found')
    }

    const filePath = `${attachment.filePath}`
    console.log({ filePath, attachment })
    res.sendFile(filePath, { root: '.' })
  }

  @AuthUser()
  @Delete(':id')
  async deleteAttachment(@Param('id') id: string) {
    await this.attachmentService.deleteAttachment(id)
    return { message: 'Attachment deleted successfully' }
  }
}

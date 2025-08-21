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
import { UserRole } from '../../db/entities/user.entity'
import { AuthUser } from '../user/user.decorator'
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
        if (file.mimetype.includes('image/')) {
          callback(null, true)
        } else {
          callback(new BadRequestException('File is not an image'), false)
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024, // 10MB limit
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
    
    res.redirect(HttpStatus.TEMPORARY_REDIRECT,presignedUrl,)

    // const { readable, filename, contentType } = await this.attachmentService.getAttachmentFile(id)
    // res.setHeader('cross-origin-resource-policy', 'cross-origin')

    // res.setHeader('Cache-Control', 'public, max-age=86400') // 1 day in seconds

    // if (contentType) {
    //   res.setHeader('Content-Type', contentType)
    // }
    // if (filename) {
    //   res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    // }

    // if (contentType.includes('image/') && query.thumbnail) {
    //   readable
    //     .pipe(
    //       sharp().resize({
    //         width: 200,
    //       })
    //     )
    //     .pipe(res)
    // } else {
    //   readable.pipe(res)
    // }
  }

  @AuthUser(UserRole.ADMIN)
  @Delete(':id')
  async deleteAttachment(@Param('id') id: string) {
    await this.attachmentService.deleteAttachment(id)
    return { message: 'Attachment deleted successfully' }
  }
}

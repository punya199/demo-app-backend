import { Column, Entity, Index } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'

@Entity({
  name: 'attachments',
})
@Index(['attachableId'], {
  where: 'deleted_at IS NULL',
})
@Index(['attachableType'], {
  where: 'deleted_at IS NULL',
})
export class AttachmentEntity extends BaseModelEntity {
  @Column({ name: 'attachable_id', type: 'uuid', nullable: true })
  attachableId: string

  @Column({ name: 'attachable_type', type: 'varchar', nullable: true })
  attachableType: string

  @Column({ name: 'file_name', type: 'varchar', nullable: false })
  fileName: string

  @Column({ name: 'file_path', type: 'varchar', nullable: false })
  filePath: string

  @Column({ name: 'mime_type', type: 'varchar', nullable: false })
  mimeType: string

  @Column({ name: 'size', type: 'integer', nullable: false })
  size: number
}

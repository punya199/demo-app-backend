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
  @Column({ type: 'uuid', nullable: false })
  attachableId: string

  @Column({ type: 'varchar', nullable: false })
  attachableType: string

  @Column()
  fileName: string

  @Column()
  url: string

  @Column()
  mimeType: string

  @Column({ nullable: true })
  size: number
}

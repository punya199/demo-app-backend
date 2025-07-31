import { ClsServiceManager } from 'nestjs-cls'
import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  RemoveEvent,
  SoftRemoveEvent,
  UpdateEvent,
} from 'typeorm'
import { BaseModelEntity } from '../entities/base-model.entity'

@EventSubscriber()
export class AuditSubscriber implements EntitySubscriberInterface<BaseModelEntity> {
  /**
   * Indicates that this subscriber only listen to BaseModelEntity events.
   */
  listenTo() {
    return BaseModelEntity
  }

  /**
   * Called before entity insertion.
   */
  beforeInsert(event: InsertEvent<BaseModelEntity>) {
    const userId = this.getCurrentUserId()
    if (userId && event.entity) {
      event.entity.creatorId = userId
      event.entity.updaterId = userId
    }
  }

  /**
   * Called before entity update.
   */
  beforeUpdate(event: UpdateEvent<BaseModelEntity>) {
    const userId = this.getCurrentUserId()
    if (userId && event.entity) {
      event.entity.updaterId = userId
    }
  }

  /**
   * Called before entity soft removal.
   */
  beforeSoftRemove(event: SoftRemoveEvent<BaseModelEntity>) {
    const userId = this.getCurrentUserId()
    if (userId && event.entity) {
      event.entity.deleterId = userId
      event.entity.updaterId = userId
    }
  }

  /**
   * Called before entity removal.
   */
  beforeRemove(event: RemoveEvent<BaseModelEntity>) {
    const userId = this.getCurrentUserId()
    if (userId && event.entity) {
      event.entity.deleterId = userId
      event.entity.updaterId = userId
    }
  }

  /**
   * Get the current user ID from CLS context
   */
  private getCurrentUserId(): string | undefined {
    try {
      const cls = ClsServiceManager.getClsService()
      const userId = cls.get('userId')
      console.log({
        tag: 'AuditSubscriber getCurrentUserId',
        userId,
      })
      return userId
    } catch (error) {
      // CLS might not be available in some contexts (e.g., migrations, tests)
      console.warn(
        'Unable to get user ID from CLS context:',
        error instanceof Error ? error.message : String(error)
      )
      return undefined
    }
  }
}

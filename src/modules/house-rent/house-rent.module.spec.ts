import { HouseRentController } from './house-rent.controller'
import { HouseRentModule } from './house-rent.module'
import { HouseRentService } from './house-rent.service'

describe('HouseRentModule', () => {
  it('wires the controller and service', () => {
    expect(Reflect.getMetadata('controllers', HouseRentModule)).toEqual([HouseRentController])
    expect(Reflect.getMetadata('providers', HouseRentModule)).toEqual([HouseRentService])
  })
})

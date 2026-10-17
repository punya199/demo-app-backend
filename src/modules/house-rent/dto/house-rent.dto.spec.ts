import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateHouseRentBodyDto } from './create-house-rent.dto'
import { EditHouseRentBodyDto } from './edit-house-rent.dto'

const uuid = '3f2b8c1e-9a4d-4e6b-8c1a-2d3e4f5a6b7c'

const payload = (rentOver: object = {}) => ({
  name: 'n',
  rents: [
    {
      month: '2026-01-01',
      houseRentPrice: 1,
      waterPrice: 1,
      electricity: { totalPrice: 1, unit: 1 },
      attachmentIds: [uuid],
      ...rentOver,
    },
  ],
  members: [
    {
      userId: uuid,
      airConditionUnit: 1,
      electricityUnit: { prev: 0, current: 1, diff: 1 },
      payInternetMonthIds: [],
      payElectricityMonthIds: [],
    },
  ],
  baseHouseRent: 1,
  paymentFee: 1,
  internet: { pricePerMonth: 1 },
  airCondition: { pricePerUnit: 1, unit: 1 },
  attachmentIds: [uuid],
})

describe.each([
  ['CreateHouseRentBodyDto', CreateHouseRentBodyDto],
  ['EditHouseRentBodyDto', EditHouseRentBodyDto],
] as const)('%s', (_name, Dto) => {
  it('accepts a valid payload, with or without per-rent attachmentIds', async () => {
    expect(await validate(plainToInstance(Dto, payload()))).toEqual([])
    expect(await validate(plainToInstance(Dto, payload({ attachmentIds: undefined })))).toEqual([])
  })

  it('rejects a non-uuid per-rent attachment id', async () => {
    const errors = await validate(plainToInstance(Dto, payload({ attachmentIds: ['nope'] })))
    expect(errors).not.toEqual([])
  })
})

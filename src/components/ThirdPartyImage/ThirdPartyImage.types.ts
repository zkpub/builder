import { ContractNetwork } from '@dcl/schemas'

export type Props = {
  className?: string
  network?: ContractNetwork
  thirdPartyId: string
  shape?: 'circle' | 'square'
}

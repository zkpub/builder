import { getIsFeatureEnabled } from 'decentraland-dapps/dist/modules/features/selectors'
import { ApplicationName } from 'decentraland-dapps/dist/modules/features/types'
import { RootState } from 'modules/common/types'
import { FeatureName } from './types'

export const getIsMaintenanceEnabled = (state: RootState) => {
  // As this is called by the routes component which is rendered when the user enters the application,
  // Features might have not yet been requested and will throw in that case.
  try {
    return getIsFeatureEnabled(state, ApplicationName.BUILDER, FeatureName.MAINTENANCE)
  } catch (e) {
    return false
  }
}

export const getIsEmotesFlowEnabled = (state: RootState) => {
  // As this is called by the routes component which is rendered when the user enters the application,
  // Features might have not yet been requested and will throw in that case.
  try {
    return getIsFeatureEnabled(state, ApplicationName.BUILDER, FeatureName.NEW_EMOTE_FLOW)
  } catch (e) {
    return false
  }
}

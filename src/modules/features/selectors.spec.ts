import { getIsFeatureEnabled } from 'decentraland-dapps/dist/modules/features/selectors'
import { ApplicationName } from 'decentraland-dapps/dist/modules/features/types'
import { RootState } from 'modules/common/types'
import {
  getIsAuthDappEnabled,
  getIsCreateSceneOnlySDK7Enabled,
  getIsMaintenanceEnabled,
  getIsSDK7TemplatesEnabled,
  getIsWorldsForEnsOwnersEnabled,
  getIsNavbarV2Enabled
} from './selectors'
import { FeatureName } from './types'

jest.mock('decentraland-dapps/dist/modules/features/selectors')

const mockGetIsFeatureEnabled = getIsFeatureEnabled as jest.MockedFunction<typeof getIsFeatureEnabled>
let state: RootState

beforeEach(() => {
  state = {} as any
})

describe('when getting if maintainance is enabled', () => {
  describe('when getIsFeatureEnabled returns true', () => {
    beforeEach(() => {
      mockGetIsFeatureEnabled.mockReturnValueOnce(true)
    })

    it('should return true', () => {
      const result = getIsMaintenanceEnabled(state)

      expect(result).toEqual(true)
    })
  })

  describe('when getIsFeatureEnabled returns false', () => {
    beforeEach(() => {
      mockGetIsFeatureEnabled.mockReturnValueOnce(false)
    })

    it('should return false', () => {
      const result = getIsMaintenanceEnabled(state)

      expect(result).toEqual(false)
    })
  })

  describe('when getIsFeatureEnabled throws an exception', () => {
    beforeEach(() => {
      mockGetIsFeatureEnabled.mockImplementationOnce(() => {
        throw new Error('error')
      })
    })

    it('should return false', () => {
      const result = getIsMaintenanceEnabled(state)

      expect(result).toEqual(false)
    })
  })
})

const ffSelectors = [
  { selector: getIsWorldsForEnsOwnersEnabled, app: ApplicationName.BUILDER, feature: FeatureName.WORLDS_FOR_ENS_OWNERS },
  { selector: getIsSDK7TemplatesEnabled, app: ApplicationName.BUILDER, feature: FeatureName.SDK7_TEMPLATES },
  { selector: getIsCreateSceneOnlySDK7Enabled, app: ApplicationName.BUILDER, feature: FeatureName.CREATE_SCENE_ONLY_SDK7 },
  { selector: getIsAuthDappEnabled, app: ApplicationName.DAPPS, feature: FeatureName.AUTH_DAPP },
  { selector: getIsNavbarV2Enabled, app: ApplicationName.DAPPS, feature: FeatureName.NAVBAR_V2 }
]

ffSelectors.forEach(({ selector, app, feature }) => {
  describe(`when getting if ${feature} is enabled`, () => {
    describe('when getIsFeatureEnabled returns true', () => {
      beforeEach(() => {
        mockGetIsFeatureEnabled.mockReturnValueOnce(true)
      })

      it('should return true', () => {
        const result = selector(state)

        expect(result).toEqual(true)
        expect(mockGetIsFeatureEnabled).toHaveBeenCalledWith(state, app, feature)
      })
    })

    describe('when getIsFeatureEnabled returns false', () => {
      beforeEach(() => {
        mockGetIsFeatureEnabled.mockReturnValueOnce(false)
      })

      it('should return false', () => {
        const result = selector(state)

        expect(result).toEqual(false)
        expect(mockGetIsFeatureEnabled).toHaveBeenCalledWith(state, app, feature)
      })
    })

    describe('when getIsFeatureEnabled throws an exception', () => {
      beforeEach(() => {
        mockGetIsFeatureEnabled.mockImplementationOnce(() => {
          throw new Error('error')
        })
      })

      it('should return false', () => {
        const result = selector(state)

        expect(result).toEqual(false)
        expect(mockGetIsFeatureEnabled).toHaveBeenCalledWith(state, app, feature)
      })
    })
  })
})

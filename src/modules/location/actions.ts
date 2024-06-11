import { action } from 'typesafe-actions'
import { Location } from 'history'

export const REDIRECT_TO_REQUEST = '[Request] Redirect request'
export const REDIRECT_TO_SUCCESS = '[Success] Redirect success'
export const REDIRECT_TO_FAILURE = '[Failure] Redirect failure'

export const redirectToRequest = (redirectTo: string) => action(REDIRECT_TO_REQUEST, { redirectTo })
export const redirectToSuccess = (redirectTo: string) => action(REDIRECT_TO_SUCCESS, { redirectTo })
export const redirectToFailure = (redirectTo: string, error: string) => action(REDIRECT_TO_FAILURE, { redirectTo, error })

export type RedirectToRequestAction = ReturnType<typeof redirectToRequest>
export type RedirectToSuccessAction = ReturnType<typeof redirectToSuccess>
export type RedirectToFailureAction = ReturnType<typeof redirectToFailure>

export const ROUTER_LOCATION_CHANGE = 'Router Location Change'
export const routerLocationChange = (location: Location<unknown>) => action(ROUTER_LOCATION_CHANGE, { location })
export type RouterLocationChangeAction = ReturnType<typeof routerLocationChange>

/**
 * Re-export all extension types from the SDK.
 *
 * Internal code and builtin extensions import from here so that the
 * canonical type definitions live in @conductor/extension-sdk.
 */
export type {
  TabProps,
  TabRegistration,
  NewTabMenuItem,
  Extension,
} from '@conductor/extension-sdk'

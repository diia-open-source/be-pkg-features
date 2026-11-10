import { Context } from 'unleash-client'

import { Language, PlatformType, ProfileFeature, SessionType } from '@diia-inhouse/types'
import type { ValidationRule } from '@diia-inhouse/validators'

export type { FeatureInterface } from 'unleash-client/lib/feature.js'

export interface FeatureConfig {
    isEnabled: boolean
    url: string
    apiToken: string
}

export interface FeatureContext extends Context {
    /**
     * Base64 encoded userIdentifier. Due to Unleash limitation max 100 chars per value we can't use userIdentifier (sha512 hex representation) for unleash values as his length is 128.
     * But at the same time base64 representation of it is 88 chars long which is fine.
     */
    userIdBase64?: string

    platformType?: PlatformType

    /** semver major(.minor)(.patch) */
    platformVersion?: string

    /** semver major.minor.patch(.build) */
    appVersion?: string

    mobileUid?: string

    sessionType?: SessionType

    profileFeature?: ProfileFeature
}

export interface FeatureVariant<TPayload = unknown> {
    isEnabled: boolean
    name?: string
    payload?: TPayload
}

export interface GetVariantOptions {
    payloadSchema?: ValidationRule
    context?: FeatureContext
}

export interface GetLocalizedVariantOptions<TField extends string> {
    fields: readonly TField[]
    context?: FeatureContext
    language?: Language
}

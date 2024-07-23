import { Context } from 'unleash-client'

import { PlatformType } from '@diia-inhouse/types'

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
}

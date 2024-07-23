import { AsyncLocalStorage } from 'node:async_hooks'

import semver from 'semver'
import { Unleash, startUnleash } from 'unleash-client'

import type { EnvService } from '@diia-inhouse/env'
import { AlsData, Logger, OnInit } from '@diia-inhouse/types'

import { FeatureConfig, FeatureContext } from '../interfaces'

export class FeatureService implements OnInit {
    private unleash!: Unleash

    constructor(
        private readonly serviceName: string,
        private readonly featureConfig: FeatureConfig,
        private readonly logger: Logger,
        private readonly envService: EnvService,
        private readonly asyncLocalStorage: AsyncLocalStorage<AlsData>,
    ) {}

    async onInit(): Promise<void> {
        const { isEnabled, url, apiToken } = this.featureConfig
        if (!isEnabled) {
            this.logger.info('Unleash is disabled. All feature flags are set to false')

            return
        }

        this.unleash = await startUnleash({
            url,
            appName: this.serviceName,
            customHeaders: { Authorization: apiToken },
            environment: this.envService.isProd() ? 'production' : 'development',
        })

        this.unleash.on('warn', (err) => {
            this.logger.warn('Unleash error event', { err })
        })

        this.unleash.on('error', (err) => {
            this.logger.error('Unleash error event', { err })
        })

        this.logger.info('Unleash has started')
    }

    isEnabled(name: string, context: FeatureContext = {}): boolean {
        if (!this.featureConfig.isEnabled) {
            this.logger.warn('Unleash is disabled')

            return false
        }

        const alsStore = this.asyncLocalStorage.getStore()

        context.userId ??= alsStore?.logData?.userIdentifier
        context.userIdBase64 ??= context.userId && Buffer.from(context.userId, 'hex').toString('base64')

        context.platformType ??= alsStore?.headers?.platformType

        context.platformVersion ??= alsStore?.headers?.platformVersion
        context.platformVersion = semver.coerce(context.platformVersion)?.version

        context.appVersion ??= alsStore?.headers?.appVersion
        context.appVersion = this.parseAppVersion(context.appVersion)

        this.logger.debug('Feature flag check', { name, context })

        return this.unleash.isEnabled(name, context)
    }

    private parseAppVersion(appVersion?: string): string | undefined {
        if (!appVersion) {
            return
        }

        const parts = appVersion.split('.')
        if (parts.length === 3) {
            return appVersion
        }

        if (parts.length === 4) {
            return parts.slice(0, 3).join('.') + `-${parts[3]}`
        }

        this.logger.warn('Invalid app version format for feature flag', { appVersion })

        return
    }
}

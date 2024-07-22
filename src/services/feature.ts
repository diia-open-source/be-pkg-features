import { AsyncLocalStorage } from 'node:async_hooks'

import semver from 'semver'
import { Unleash, startUnleash } from 'unleash-client'
import { FeatureInterface } from 'unleash-client/lib/feature'

import type { EnvService } from '@diia-inhouse/env'
import { AlsData, Logger, OnInit } from '@diia-inhouse/types'

import { FeatureConfig, FeatureContext } from '../interfaces'

export class FeatureService implements OnInit {
    private unleash: Unleash | null = null

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
            tags: [{ name: 'microservice', value: this.serviceName }],
        })

        this.unleash.on('warn', (err) => {
            this.logger.warn('Unleash warn event', { err })
        })

        this.unleash.on('error', (err) => {
            this.logger.error('Unleash error event', { err })
        })

        this.logger.info('Unleash has started')
    }

    isEnabled(name: string, context: FeatureContext = {}): boolean {
        if (!this.unleash) {
            this.logger.warn('Unleash is disabled')

            return false
        }

        const alsStore = this.asyncLocalStorage.getStore() ?? {}

        context.userId ??= alsStore.logData?.userIdentifier
        context.userIdBase64 ??= context.userId && Buffer.from(context.userId, 'hex').toString('base64')

        context.sessionType ??= alsStore.logData?.sessionType

        context.platformType ??= alsStore.headers?.platformType

        context.platformVersion ??= alsStore.headers?.platformVersion
        context.platformVersion = semver.coerce(context.platformVersion)?.version

        context.appVersion ??= alsStore.headers?.appVersion
        context.appVersion = this.parseAppVersion(context.appVersion)

        context.currentTime ??= new Date()

        this.logger.debug('Feature flag check', { name, context })

        const result = this.unleash.isEnabled(name, context)
        if (result) {
            alsStore.logData ??= {}
            alsStore.logData.flags ??= []
            alsStore.logData.flags.push(name)
            this.asyncLocalStorage.enterWith(alsStore)
        }

        return result
    }

    isSomeEnabled(name: string, contexts: FeatureContext[]): boolean {
        return contexts.some((context) => this.isEnabled(name, context))
    }

    getDefinition(name: string): FeatureInterface | undefined {
        return this.unleash?.getFeatureToggleDefinition(name)
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

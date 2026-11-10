import { AsyncLocalStorage } from 'node:async_hooks'

import semver from 'semver'
import { PayloadType, Unleash, startUnleash } from 'unleash-client'
import { FeatureInterface } from 'unleash-client/lib/feature.js'
import type { Payload, Variant } from 'unleash-client/lib/variant.js'

import type { EnvService } from '@diia-inhouse/env'
import { AlsData, Language, Languages, Logger, OnInit, WithLocales } from '@diia-inhouse/types'
import type { AppValidator, ValidationRule } from '@diia-inhouse/validators'

import { FeatureConfig, FeatureContext, FeatureVariant, GetLocalizedVariantOptions, GetVariantOptions } from '../interfaces/index.js'

export class FeatureService implements OnInit {
    private unleash: Unleash | null = null

    constructor(
        private readonly serviceName: string,
        private readonly featureConfig: FeatureConfig,
        private readonly logger: Logger,
        private readonly envService: EnvService,
        private readonly asyncLocalStorage: AsyncLocalStorage<AlsData>,
        private readonly validator: AppValidator,
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

        const alsStore: AlsData = this.asyncLocalStorage.getStore() ?? {}
        const resolvedContext = this.resolveContext(context, alsStore)

        this.logger.debug('Feature flag check', { name, context: resolvedContext })

        const result = this.unleash.isEnabled(name, resolvedContext)
        if (result) {
            this.markFlagEnabled(name, alsStore)
        }

        return result
    }

    isSomeEnabled(name: string, contexts: FeatureContext[]): boolean {
        return contexts.some((context) => this.isEnabled(name, context))
    }

    getVariant<TPayload = unknown>(name: string, options: GetVariantOptions = {}): FeatureVariant<TPayload> {
        if (!this.unleash) {
            this.logger.warn('Unleash is disabled')

            return { isEnabled: false }
        }

        const alsStore: AlsData = this.asyncLocalStorage.getStore() ?? {}
        const resolvedContext = this.resolveContext(options.context ?? {}, alsStore)

        const variant = this.unleash.getVariant(name, resolvedContext)

        this.logger.debug('Feature flag variant check', {
            name,
            context: resolvedContext,
            variant: variant.name,
            isFeatureEnabled: variant.feature_enabled,
        })

        if (!variant.feature_enabled) {
            return { isEnabled: false }
        }

        this.markFlagEnabled(name, alsStore)

        if (!variant.enabled) {
            return { isEnabled: true }
        }

        const payload = this.parsePayload<TPayload>(name, variant, options.payloadSchema)
        if (payload === undefined) {
            return { isEnabled: true, name: variant.name }
        }

        return { isEnabled: true, name: variant.name, payload }
    }

    async getLocalizedVariant<TField extends string>(
        name: string,
        options: GetLocalizedVariantOptions<TField>,
    ): Promise<FeatureVariant<Record<TField, string>>> {
        const { getLocalizedValidationSchema } = await import('@diia-inhouse/i18n')
        const { fields, context, language } = options
        const { payload, ...variant } = this.getVariant<WithLocales<Record<TField, string>>['locales']>(name, {
            payloadSchema: getLocalizedValidationSchema(fields),
            context,
        })
        if (!payload) {
            return variant
        }

        const alsStore: AlsData = this.asyncLocalStorage.getStore() ?? {}

        return { ...variant, payload: this.localizePayload(payload, language ?? this.resolveLanguage(alsStore)) }
    }

    getDefinition(name: string): FeatureInterface | undefined {
        return this.unleash?.getFeatureToggleDefinition(name)
    }

    private resolveContext(context: FeatureContext, alsStore: AlsData): FeatureContext {
        context.userId ??= alsStore.logData?.userIdentifier
        context.userIdBase64 ??= context.userId && Buffer.from(context.userId, 'hex').toString('base64')

        context.sessionType ??= alsStore.logData?.sessionType

        context.platformType ??= alsStore.headers?.platformType

        context.platformVersion ??= alsStore.headers?.platformVersion
        context.platformVersion = semver.coerce(context.platformVersion)?.version

        context.appVersion ??= alsStore.headers?.appVersion
        context.appVersion = this.parseAppVersion(context.appVersion)

        context.mobileUid ??= alsStore.headers?.mobileUid

        context.currentTime ??= new Date()

        context.environment ??= this.envService.getEnv()

        return context
    }

    private markFlagEnabled(name: string, alsStore: AlsData): void {
        alsStore.logData ??= {}
        alsStore.logData.flags ??= []
        if (!alsStore.logData.flags.includes(name)) {
            alsStore.logData.flags.push(name)
        }

        this.asyncLocalStorage.enterWith(alsStore)
    }

    private parsePayload<TPayload>(name: string, variant: Variant, payloadSchema?: ValidationRule): TPayload | undefined {
        const { payload: variantPayload } = variant
        if (!variantPayload || !payloadSchema) {
            return
        }

        try {
            const payload = this.toPayloadValue(variantPayload)

            this.validator.validate({ payload }, { payload: payloadSchema })

            return payload as TPayload
        } catch (err) {
            this.logger.warn('Invalid feature flag variant payload', { name, variant, err })

            return
        }
    }

    private toPayloadValue({ type, value }: Payload): unknown {
        switch (type) {
            case PayloadType.JSON: {
                return JSON.parse(value)
            }
            case PayloadType.NUMBER: {
                return Number(value)
            }
            case PayloadType.CSV: {
                return value.split(',')
            }
            default: {
                return value
            }
        }
    }

    private resolveLanguage(alsStore: AlsData): Language {
        const { acceptLanguage } = alsStore.headers ?? {}

        return Object.values(Languages).find((language) => language === acceptLanguage) ?? Languages.Uk
    }

    private localizePayload<TItem>(locales: WithLocales<TItem>['locales'], language: Language): TItem {
        return locales[language] ?? locales[Languages.Uk]
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
            return `${parts.slice(0, 3).join('.')}-${parts[3]}`
        }

        this.logger.warn('Invalid app version format for feature flag', { appVersion })

        return
    }
}

import { AsyncLocalStorage } from 'node:async_hooks'

import * as UnleashClient from 'unleash-client'
import { mock } from 'vitest-mock-extended'

import Logger from '@diia-inhouse/diia-logger'
import { EnvService } from '@diia-inhouse/env'
import { AlsData, Language, Languages, WithLocales } from '@diia-inhouse/types'
import { AppValidator, ValidationRule } from '@diia-inhouse/validators'

import { FeatureConfig, FeatureService, FeatureVariant } from '../../src/index'
import { disabledUnleashConfig, enabledUnleashConfig } from '../../tests/mocks'

describe('class: `FeatureService`', () => {
    const logger = mock<Logger>()

    function createFeatureService(featureConfig: FeatureConfig, asyncLocalStorage = new AsyncLocalStorage<AlsData>()): FeatureService {
        return new FeatureService('ServiceName', featureConfig, logger, mock<EnvService>(), asyncLocalStorage, new AppValidator())
    }

    async function createStartedFeatureService(
        getVariantSpy: () => UnleashClient.Variant,
        alsStore = new AsyncLocalStorage<AlsData>(),
    ): Promise<FeatureService> {
        const featureService = createFeatureService(enabledUnleashConfig, alsStore)

        vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
            on: vi.fn<() => void>(),
            getVariant: getVariantSpy,
        } as unknown as UnleashClient.Unleash)
        await featureService.onInit()

        return featureService
    }

    describe('method: `onInit`', () => {
        it('should start Unleash if it is enabled in configuration', async () => {
            // Arrange
            const enabledFeatureService = createFeatureService(enabledUnleashConfig)
            const startUnleashSpy = vi
                .spyOn(UnleashClient, 'startUnleash')
                .mockResolvedValueOnce({ on: vi.fn<() => void>() } as unknown as UnleashClient.Unleash)

            // Act
            await enabledFeatureService.onInit()

            // Assert
            expect(startUnleashSpy).toHaveBeenCalled()
            expect(logger.info).toHaveBeenCalledWith('Unleash has started')
        })

        it('should not start Unleash if it is disabled in configuration', async () => {
            // Arrange
            const disabledFeatureService = createFeatureService(disabledUnleashConfig)
            const startUnleashSpy = vi
                .spyOn(UnleashClient, 'startUnleash')
                .mockResolvedValueOnce({ on: vi.fn<() => void>() } as unknown as UnleashClient.Unleash)

            // Act
            await disabledFeatureService.onInit()

            // Assert
            expect(startUnleashSpy).not.toHaveBeenCalled()
            expect(logger.info).toHaveBeenCalledWith('Unleash is disabled. All feature flags are set to false')
        })
    })

    describe('method: `isEnabled`', () => {
        it('should return false if Unleash is disabled in configuration', () => {
            const name = 'test_name'
            const disabledFeatureService = createFeatureService(disabledUnleashConfig)

            expect(disabledFeatureService.isEnabled(name)).toBe(false)
            expect(logger.warn).toHaveBeenCalledWith('Unleash is disabled')
        })

        it('should provide correct context values to Unleash', async () => {
            // Arrange
            const name = 'test_name'
            const enabledFeatureService = createFeatureService(enabledUnleashConfig)
            const isEnabledSpy = vi.fn<() => boolean>()

            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn<() => void>(),
                isEnabled: isEnabledSpy,
            } as unknown as UnleashClient.Unleash)
            await enabledFeatureService.onInit()

            // Act
            enabledFeatureService.isEnabled(name, { appVersion: '4.0.20.674', platformVersion: '10' })
            enabledFeatureService.isEnabled(name, { appVersion: '4.0.15', platformVersion: '12.2.1' })
            enabledFeatureService.isEnabled(name, { appVersion: '4.0', platformVersion: '12.2.1' })

            // Assert
            expect(isEnabledSpy).toHaveBeenNthCalledWith(1, name, {
                appVersion: '4.0.20-674',
                platformVersion: '10.0.0',
                currentTime: expect.any(Date),
            })
            expect(isEnabledSpy).toHaveBeenNthCalledWith(2, name, {
                appVersion: '4.0.15',
                platformVersion: '12.2.1',
                currentTime: expect.any(Date),
            })
            expect(isEnabledSpy).toHaveBeenNthCalledWith(3, name, {
                platformVersion: '12.2.1',
                currentTime: expect.any(Date),
            })
        })

        it('should not add flag to logData if it is already present', async () => {
            // Arrange
            const name = 'test_name'
            const alsStore = new AsyncLocalStorage<AlsData>()
            const enabledFeatureService = createFeatureService(enabledUnleashConfig, alsStore)
            const isEnabledSpy = vi.fn<() => boolean>()

            isEnabledSpy.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false)

            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn<() => void>(),
                isEnabled: isEnabledSpy,
            } as unknown as UnleashClient.Unleash)
            await enabledFeatureService.onInit()

            alsStore.run({ logData: { flags: [name] } }, () => {
                // Act
                enabledFeatureService.isEnabled(name)
                enabledFeatureService.isEnabled(`${name}_2`)
                enabledFeatureService.isEnabled(`${name}_3`)

                // Assert
                expect(alsStore.getStore()?.logData?.flags).toEqual([name, `${name}_2`])
            })
        })
    })

    describe('method: `isSomeEnabled`', () => {
        const featureService = createFeatureService(enabledUnleashConfig)
        const isEnabledSpy = vi.fn<() => boolean>()

        beforeAll(async () => {
            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn<() => void>(),
                isEnabled: isEnabledSpy,
            } as unknown as UnleashClient.Unleash)
            await featureService.onInit()
        })

        it('should return false if no contexts provided', () => {
            expect(featureService.isSomeEnabled('test_name', [])).toBe(false)
        })

        it('should return false if feature is disabled for all contexts', () => {
            isEnabledSpy.mockReturnValueOnce(false).mockReturnValueOnce(false)
            expect(featureService.isSomeEnabled('test_name', [{}, {}])).toBe(false)
        })

        it('should return true if at least one context is enabled', () => {
            isEnabledSpy.mockReturnValueOnce(false).mockReturnValueOnce(true).mockReturnValueOnce(false)
            expect(featureService.isSomeEnabled('test_name', [{}, {}, {}])).toBe(true)
        })
    })

    describe('method: `getDefinition`', () => {
        const featureService = createFeatureService(enabledUnleashConfig)
        const getFeatureToggleDefinitionSpy = vi.fn<() => unknown>()

        beforeAll(async () => {
            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn<() => void>(),
                getFeatureToggleDefinition: getFeatureToggleDefinitionSpy,
            } as unknown as UnleashClient.Unleash)
            await featureService.onInit()
        })

        it('should return feature definition', () => {
            const name = 'test_name'
            const definition = { name, enabled: true }

            getFeatureToggleDefinitionSpy.mockReturnValueOnce(definition)

            expect(featureService.getDefinition(name)).toEqual(definition)
        })
    })

    describe('method: `getVariant`', () => {
        const name = 'test_name'
        const variantName = 'closed_message'
        const payloadSchema: ValidationRule = { type: 'object', props: { title: { type: 'string', empty: false } } }
        const enabledVariant: UnleashClient.Variant = {
            name: variantName,
            enabled: true,
            feature_enabled: true,
            payload: { type: UnleashClient.PayloadType.JSON, value: '{"title":"Title"}' },
        }
        const disabledVariant: UnleashClient.Variant = { name: 'disabled', enabled: false, feature_enabled: false }
        const enabledFlagWithoutVariants: UnleashClient.Variant = { name: 'disabled', enabled: false, feature_enabled: true }

        interface PayloadCase {
            type: UnleashClient.PayloadType
            value: string
            payloadSchema: ValidationRule
            expected: unknown
        }

        const payloadCases: PayloadCase[] = [
            {
                type: UnleashClient.PayloadType.JSON,
                value: '{"title":"Title"}',
                payloadSchema,
                expected: { title: 'Title' },
            },
            {
                type: UnleashClient.PayloadType.STRING,
                value: 'closed',
                payloadSchema: { type: 'string', empty: false },
                expected: 'closed',
            },
            { type: UnleashClient.PayloadType.NUMBER, value: '42', payloadSchema: { type: 'number' }, expected: 42 },
            { type: UnleashClient.PayloadType.CSV, value: 'a,b', payloadSchema: { type: 'array', items: 'string' }, expected: ['a', 'b'] },
        ]

        function toVariant(payload: UnleashClient.Variant['payload']): UnleashClient.Variant {
            return { name: variantName, enabled: true, feature_enabled: true, payload }
        }

        it('should return disabled variant if Unleash is disabled in configuration', () => {
            const disabledFeatureService = createFeatureService(disabledUnleashConfig)

            expect(disabledFeatureService.getVariant(name)).toStrictEqual<FeatureVariant>({ isEnabled: false })
        })

        it('should return disabled variant and not mark the flag when the feature is disabled', async () => {
            // Arrange
            const alsStore = new AsyncLocalStorage<AlsData>()
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(disabledVariant),
                alsStore,
            )

            alsStore.run({ logData: {} }, () => {
                // Act
                const variant = featureService.getVariant(name, { payloadSchema })

                // Assert
                expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: false })
                expect(alsStore.getStore()?.logData?.flags).toBeUndefined()
            })
        })

        it('should return enabled variant without name when the feature has no variants', async () => {
            // Arrange
            const alsStore = new AsyncLocalStorage<AlsData>()
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(enabledFlagWithoutVariants),
                alsStore,
            )

            alsStore.run({ logData: {} }, () => {
                // Act
                const variant = featureService.getVariant(name, { payloadSchema })

                // Assert
                expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true })
                expect(alsStore.getStore()?.logData?.flags).toEqual([name])
            })
        })

        it('should return variant name without payload when no payload schema is given', async () => {
            // Arrange
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(enabledVariant),
            )

            // Act
            const variant = featureService.getVariant(name)

            // Assert
            expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true, name: variantName })
        })

        it('should return variant name without payload when the variant has no payload', async () => {
            // Arrange
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(toVariant(undefined)),
            )

            // Act
            const variant = featureService.getVariant(name, { payloadSchema })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true, name: variantName })
        })

        it.each(payloadCases)(
            'should parse $type payload and validate it against the schema',
            async ({ type, value, payloadSchema: schema, expected }) => {
                // Arrange
                const unleashVariant = toVariant({ type, value })
                const featureService = await createStartedFeatureService(
                    vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(unleashVariant),
                )

                // Act
                const variant = featureService.getVariant(name, { payloadSchema: schema })

                // Assert
                expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true, name: variantName, payload: expected })
            },
        )

        it('should drop payload when json payload is not parseable', async () => {
            // Arrange
            const unleashVariant = toVariant({ type: UnleashClient.PayloadType.JSON, value: '{' })
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(unleashVariant),
            )

            // Act
            const variant = featureService.getVariant(name, { payloadSchema })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true, name: variantName })
        })

        it('should drop payload when payload does not match the schema', async () => {
            // Arrange
            const unleashVariant = toVariant({ type: UnleashClient.PayloadType.JSON, value: '{"title":""}' })
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(unleashVariant),
            )

            // Act
            const variant = featureService.getVariant(name, { payloadSchema })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true, name: variantName })
        })

        it('should drop payload when number payload is not numeric', async () => {
            // Arrange
            const unleashVariant = toVariant({ type: UnleashClient.PayloadType.NUMBER, value: 'abc' })
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(unleashVariant),
            )

            // Act
            const variant = featureService.getVariant(name, { payloadSchema: { type: 'number' } })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant>({ isEnabled: true, name: variantName })
        })

        it('should provide correct context values to Unleash', async () => {
            // Arrange
            const getVariantSpy = vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(disabledVariant)
            const featureService = await createStartedFeatureService(getVariantSpy)

            // Act
            featureService.getVariant(name, { context: { appVersion: '4.0.20.674', platformVersion: '10' } })

            // Assert
            expect(getVariantSpy).toHaveBeenCalledWith(name, {
                appVersion: '4.0.20-674',
                platformVersion: '10.0.0',
                currentTime: expect.any(Date),
            })
        })

        it('should add flag to logData only if feature is enabled', async () => {
            // Arrange
            const alsStore = new AsyncLocalStorage<AlsData>()
            const getVariantSpy = vi
                .fn<() => UnleashClient.Variant>()
                .mockReturnValueOnce(enabledVariant)
                .mockReturnValueOnce(disabledVariant)
                .mockReturnValueOnce(enabledFlagWithoutVariants)
            const featureService = await createStartedFeatureService(getVariantSpy, alsStore)

            alsStore.run({ logData: {} }, () => {
                // Act
                featureService.getVariant(name)
                featureService.getVariant(`${name}_2`)
                featureService.getVariant(`${name}_3`)

                // Assert
                expect(alsStore.getStore()?.logData?.flags).toEqual([name, `${name}_3`])
            })
        })
    })

    describe('method: `getLocalizedVariant`', () => {
        const name = 'test_name'
        const variantName = 'closed_message'

        interface ClosedMessage {
            title: string
            text: string
        }

        const fields = ['title', 'text'] as const
        const ukMessage: ClosedMessage = { title: 'Послуга на паузі', text: 'Подання заяв відновиться 13 січня' }
        const enMessage: ClosedMessage = { title: 'Service paused', text: 'Applications resume on 13 January' }
        const disabledVariant: UnleashClient.Variant = { name: 'disabled', enabled: false, feature_enabled: false }

        function toLocalizedVariant(locales: unknown): UnleashClient.Variant {
            return {
                name: variantName,
                enabled: true,
                feature_enabled: true,
                payload: { type: UnleashClient.PayloadType.JSON, value: JSON.stringify(locales) },
            }
        }

        interface LanguageCase {
            description: string
            acceptLanguage?: string
            locales: WithLocales<ClosedMessage>['locales']
            language?: Language
            expected: ClosedMessage
        }

        const languageCases: LanguageCase[] = [
            {
                description: 'uk payload when the request has no language',
                locales: { uk: ukMessage, en: enMessage },
                expected: ukMessage,
            },
            {
                description: 'payload of the request language',
                acceptLanguage: Languages.En,
                locales: { uk: ukMessage, en: enMessage },
                expected: enMessage,
            },
            {
                description: 'uk payload when the request language is missing from the payload',
                acceptLanguage: Languages.En,
                locales: { uk: ukMessage },
                expected: ukMessage,
            },
            {
                description: 'uk payload when the request language is not supported',
                acceptLanguage: 'fr',
                locales: { uk: ukMessage, en: enMessage },
                expected: ukMessage,
            },
            {
                description: 'payload of the language option over the request language',
                acceptLanguage: Languages.Uk,
                locales: { uk: ukMessage, en: enMessage },
                language: Languages.En,
                expected: enMessage,
            },
        ]

        it.each(languageCases)('should return $description', async ({ acceptLanguage, locales, language, expected }) => {
            // Arrange
            const alsStore = new AsyncLocalStorage<AlsData>()
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(toLocalizedVariant(locales)),
                alsStore,
            )

            await alsStore.run({ headers: { traceId: 'test_trace_id', acceptLanguage } }, async () => {
                // Act
                const variant = await featureService.getLocalizedVariant(name, { fields, language })

                // Assert
                expect(variant).toStrictEqual<FeatureVariant<ClosedMessage>>({ isEnabled: true, name: variantName, payload: expected })
            })
        })

        it('should return variant without payload when a locale does not match the item schema', async () => {
            // Arrange
            const featureService = await createStartedFeatureService(
                vi
                    .fn<() => UnleashClient.Variant>()
                    .mockReturnValueOnce(toLocalizedVariant({ uk: { title: 'Послуга на паузі', text: '' } })),
            )

            // Act
            const variant = await featureService.getLocalizedVariant(name, { fields })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant<ClosedMessage>>({ isEnabled: true, name: variantName })
        })

        it('should return variant without payload when the uk locale is missing', async () => {
            // Arrange
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(toLocalizedVariant({ en: enMessage })),
            )

            // Act
            const variant = await featureService.getLocalizedVariant(name, { fields })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant<ClosedMessage>>({ isEnabled: true, name: variantName })
        })

        it('should return disabled variant when the feature is disabled', async () => {
            // Arrange
            const featureService = await createStartedFeatureService(
                vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(disabledVariant),
            )

            // Act
            const variant = await featureService.getLocalizedVariant(name, { fields })

            // Assert
            expect(variant).toStrictEqual<FeatureVariant<ClosedMessage>>({ isEnabled: false })
        })

        it('should provide the context to Unleash', async () => {
            // Arrange
            const getVariantSpy = vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(disabledVariant)
            const featureService = await createStartedFeatureService(getVariantSpy)

            // Act
            await featureService.getLocalizedVariant(name, { fields, context: { platformVersion: '10' } })

            // Assert
            expect(getVariantSpy).toHaveBeenCalledWith(name, { platformVersion: '10.0.0', currentTime: expect.any(Date) })
        })
    })
})

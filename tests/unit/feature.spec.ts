import { AsyncLocalStorage } from 'node:async_hooks'

import * as UnleashClient from 'unleash-client'
import { mock } from 'vitest-mock-extended'

import Logger from '@diia-inhouse/diia-logger'
import { EnvService } from '@diia-inhouse/env'
import { AlsData } from '@diia-inhouse/types'

import { FeatureService } from '../../src/index'
import { disabledUnleashConfig, enabledUnleashConfig } from '../../tests/mocks'

describe('class: `FeatureService`', () => {
    const logger = mock<Logger>()

    describe('method: `onInit`', () => {
        it('should start Unleash if it is enabled in configuration', async () => {
            // Arrange
            const enabledFeatureService = new FeatureService(
                'ServiceName',
                enabledUnleashConfig,
                logger,
                mock<EnvService>(),
                new AsyncLocalStorage(),
            )
            const startUnleashSpy = vi
                .spyOn(UnleashClient, 'startUnleash')
                .mockResolvedValueOnce({ on: vi.fn() } as unknown as UnleashClient.Unleash)

            // Act
            await enabledFeatureService.onInit()

            // Assert
            expect(startUnleashSpy).toHaveBeenCalled()
            expect(logger.info).toHaveBeenCalledWith('Unleash has started')
        })

        it('should not start Unleash if it is disabled in configuration', async () => {
            // Arrange
            const disabledFeatureService = new FeatureService(
                'ServiceName',
                disabledUnleashConfig,
                logger,
                mock<EnvService>(),
                new AsyncLocalStorage(),
            )
            const startUnleashSpy = vi
                .spyOn(UnleashClient, 'startUnleash')
                .mockResolvedValueOnce({ on: vi.fn() } as unknown as UnleashClient.Unleash)

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
            const disabledFeatureService = new FeatureService(
                'ServiceName',
                disabledUnleashConfig,
                logger,
                mock<EnvService>(),
                new AsyncLocalStorage(),
            )

            expect(disabledFeatureService.isEnabled(name)).toBe(false)
            expect(logger.warn).toHaveBeenCalledWith('Unleash is disabled')
        })

        it('should provide correct context values to Unleash', async () => {
            // Arrange
            const name = 'test_name'
            const enabledFeatureService = new FeatureService(
                'ServiceName',
                enabledUnleashConfig,
                logger,
                mock<EnvService>(),
                new AsyncLocalStorage(),
            )
            const isEnabledSpy = vi.fn()

            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn(),
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
            const enabledFeatureService = new FeatureService('ServiceName', enabledUnleashConfig, logger, mock<EnvService>(), alsStore)
            const isEnabledSpy = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValueOnce(false)

            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn(),
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
        const featureService = new FeatureService('ServiceName', enabledUnleashConfig, logger, mock<EnvService>(), new AsyncLocalStorage())
        const isEnabledSpy = vi.fn()

        beforeAll(async () => {
            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn(),
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
        const featureService = new FeatureService('ServiceName', enabledUnleashConfig, logger, mock<EnvService>(), new AsyncLocalStorage())
        const getFeatureToggleDefinitionSpy = vi.fn()

        beforeAll(async () => {
            vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
                on: vi.fn(),
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
})

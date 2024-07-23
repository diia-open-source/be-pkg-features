import { AsyncLocalStorage } from 'node:async_hooks'

import * as UnleashClient from 'unleash-client'

import { EnvService } from '@diia-inhouse/env'
import { mockInstance } from '@diia-inhouse/test'

import { FeatureService } from '../../src/index'
import { disabledUnleashConfig, enabledUnleashConfig, logger } from '../../tests/mocks'

describe('class: `FeatureService`', () => {
    describe('method: `onInit`', () => {
        it('should start Unleash if it is enabled in configuration', async () => {
            // Arrange
            const enabledFeatureService = new FeatureService(
                'ServiceName',
                enabledUnleashConfig,
                logger,
                mockInstance(EnvService),
                new AsyncLocalStorage(),
            )
            const startUnleashSpy = jest
                .spyOn(UnleashClient, 'startUnleash')
                .mockResolvedValueOnce(<UnleashClient.Unleash>(<unknown>{ on: jest.fn() }))

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
                mockInstance(EnvService),
                new AsyncLocalStorage(),
            )
            const startUnleashSpy = jest
                .spyOn(UnleashClient, 'startUnleash')
                .mockResolvedValueOnce(<UnleashClient.Unleash>(<unknown>{ on: jest.fn() }))

            // Act
            await disabledFeatureService.onInit()

            // Assert
            expect(startUnleashSpy).not.toHaveBeenCalled()
            expect(logger.info).toHaveBeenCalledWith('Unleash is disabled. All feature flags are set to false')
        })
    })

    describe('method: `isEnabled`', () => {
        it('should return false if Unleash is disabled in configuration', () => {
            const name = 'test-name'
            const disabledFeatureService = new FeatureService(
                'ServiceName',
                disabledUnleashConfig,
                logger,
                mockInstance(EnvService),
                new AsyncLocalStorage(),
            )

            expect(disabledFeatureService.isEnabled(name)).toBe(false)
            expect(logger.warn).toHaveBeenCalledWith('Unleash is disabled')
        })

        it('should provide correct context values to Unleash', async () => {
            // Arrange
            const name = 'test-name'
            const enabledFeatureService = new FeatureService(
                'ServiceName',
                enabledUnleashConfig,
                logger,
                mockInstance(EnvService),
                new AsyncLocalStorage(),
            )
            const isEnabledSpy = jest.fn()

            jest.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce(<UnleashClient.Unleash>(
                (<unknown>{ on: jest.fn(), isEnabled: isEnabledSpy })
            ))
            await enabledFeatureService.onInit()

            // Act
            enabledFeatureService.isEnabled(name, { appVersion: '4.0.20.674', platformVersion: '10' })
            enabledFeatureService.isEnabled(name, { appVersion: '4.0.15', platformVersion: '12.2.1' })
            enabledFeatureService.isEnabled(name, { appVersion: '4.0', platformVersion: '12.2.1' })

            // Assert
            expect(isEnabledSpy).toHaveBeenNthCalledWith(1, name, {
                appVersion: '4.0.20-674',
                platformVersion: '10.0.0',
            })
            expect(isEnabledSpy).toHaveBeenNthCalledWith(2, name, {
                appVersion: '4.0.15',
                platformVersion: '12.2.1',
            })
            expect(isEnabledSpy).toHaveBeenNthCalledWith(3, name, {
                platformVersion: '12.2.1',
            })
        })
    })
})

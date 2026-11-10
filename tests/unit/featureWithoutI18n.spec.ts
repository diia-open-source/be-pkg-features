import { AsyncLocalStorage } from 'node:async_hooks'

import * as UnleashClient from 'unleash-client'
import { mock } from 'vitest-mock-extended'

import Logger from '@diia-inhouse/diia-logger'
import { EnvService } from '@diia-inhouse/env'
import { AlsData } from '@diia-inhouse/types'
import { AppValidator } from '@diia-inhouse/validators'

import { FeatureService } from '../../src/index'
import { enabledUnleashConfig } from '../../tests/mocks'

vi.mock('@diia-inhouse/i18n', () => {
    throw Object.assign(new Error("Cannot find package '@diia-inhouse/i18n'"), { code: 'ERR_MODULE_NOT_FOUND' })
})

describe('class: `FeatureService` without `@diia-inhouse/i18n` installed', () => {
    const name = 'test_name'
    const fields = ['title', 'text'] as const
    const enabledVariant: UnleashClient.Variant = { name: 'closed_message', enabled: true, feature_enabled: true }

    async function createStartedFeatureService(): Promise<FeatureService> {
        const featureService = new FeatureService(
            'ServiceName',
            enabledUnleashConfig,
            mock<Logger>(),
            mock<EnvService>(),
            new AsyncLocalStorage<AlsData>(),
            new AppValidator(),
        )

        vi.spyOn(UnleashClient, 'startUnleash').mockResolvedValueOnce({
            on: vi.fn<() => void>(),
            isEnabled: vi.fn<() => boolean>().mockReturnValueOnce(true),
            getVariant: vi.fn<() => UnleashClient.Variant>().mockReturnValueOnce(enabledVariant),
        } as unknown as UnleashClient.Unleash)
        await featureService.onInit()

        return featureService
    }

    it('should check boolean flags', async () => {
        // Arrange
        const featureService = await createStartedFeatureService()

        // Act
        const isEnabled = featureService.isEnabled(name)

        // Assert
        expect(isEnabled).toBe(true)
    })

    it('should reject localized variants', async () => {
        // Arrange
        const featureService = await createStartedFeatureService()

        // Act & Assert
        await expect(featureService.getLocalizedVariant(name, { fields })).rejects.toThrow(Error)
    })
})

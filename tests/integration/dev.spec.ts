/* eslint-disable no-console */
import { AsyncLocalStorage } from 'node:async_hooks'

import DiiaLogger from '@diia-inhouse/diia-logger'
import { EnvService } from '@diia-inhouse/env'
import { LogLevel, PlatformType } from '@diia-inhouse/types'

import { FeatureService } from '../../src/index'

// The test case for the development purposes
// eslint-disable-next-line jest/no-disabled-tests
describe.skip('class: `FeatureService`', () => {
    const logger = new DiiaLogger()
    const url = ''
    const apiToken = ''

    it('should init successfully', async () => {
        const featureService = new FeatureService(
            'ServiceName',
            { isEnabled: true, url, apiToken },
            new DiiaLogger({ logLevel: LogLevel.DEBUG }),
            new EnvService(logger),
            new AsyncLocalStorage(),
        )

        await expect(featureService.onInit()).resolves.not.toThrow()

        console.log(
            'isEnabled:',
            featureService.isEnabled('public_service_reparations', { platformType: PlatformType.Android, appVersion: '4.0.12-124' }),
        )
    })
})

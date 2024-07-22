import { randomUUID } from 'node:crypto'

import Logger from '@diia-inhouse/diia-logger'
import { mockInstance } from '@diia-inhouse/test'

import { FeatureConfig } from '../../src/interfaces'

export const logger = mockInstance(Logger)

export const enabledUnleashConfig: FeatureConfig = {
    isEnabled: true,
    url: 'string',
    apiToken: randomUUID(),
}

export const disabledUnleashConfig: FeatureConfig = {
    isEnabled: false,
    url: 'string',
    apiToken: randomUUID(),
}

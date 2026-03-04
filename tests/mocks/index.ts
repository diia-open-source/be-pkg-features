import { randomUUID } from 'node:crypto'

import { FeatureConfig } from '../../src/interfaces'

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

param location string = resourceGroup().location

@description('Base name prefix for resources')
param baseName string = 'tour'

@description('Azure region code for Speech (e.g., eastus). Must match the Speech resource region.')
param speechRegion string = location

var stgName = toLower('${uniqueString(resourceGroup().id, baseName)}stg')
var fnName  = toLower('fn-${baseName}-${uniqueString(resourceGroup().id)}')

resource storage 'Microsoft.Storage/storageAccounts@2023-04-01' = {
  name: stgName
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
  }
}

resource appi 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${baseName}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
  }
}

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'plan-${baseName}'
  location: location
  sku: { name: 'Y1'; tier: 'Dynamic' } // Functions Consumption
}

resource fn 'Microsoft.Web/sites@2023-12-01' = {
  name: fnName
  location: location
  kind: 'functionapp'
  identity: { type: 'SystemAssigned' }
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${listKeys(storage.id, '2023-04-01').keys[0].value};EndpointSuffix=core.windows.net' }
        { name: 'APPINSIGHTS_INSTRUMENTATIONKEY', value: appi.properties.InstrumentationKey }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appi.properties.ConnectionString }
        // The three settings below are used by the API code
        { name: 'VISION_ENDPOINT', value: reference(vision.id, '2024-10-01').properties.endpoint }
        { name: 'TRANSLATOR_ENDPOINT', value: reference(translator.id, '2024-10-01').properties.endpoint }
        { name: 'SPEECH_REGION', value: speechRegion }
        // CORS (allow your web origin or * for a quick demo)
        { name: 'WEBSITE_AUTH_DISABLED', value: 'true' }
      ]
      cors: {
        allowedOrigins: [
          '*'  // replace with your app origin in prod
        ]
        supportCredentials: false
      }
      http20Enabled: true
      ftpsState: 'Disabled'
    }
  }
  dependsOn: [storage, plan, appi, vision, translator, speech]
}

// Cognitive Services
resource vision 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'cv-${baseName}'
  location: location
  kind: 'ComputerVision' // Image Analysis 4.0 lives under this account kind
  sku: { name: 'S0' }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

resource translator 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'tr-${baseName}'
  location: location
  kind: 'TextTranslation'
  sku: { name: 'S1' }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

resource speech 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'sp-${baseName}'
  location: speechRegion
  kind: 'SpeechServices'
  sku: { name: 'S0' }
  properties: {
    publicNetworkAccess: 'Enabled'
  }
}

// Outputs for the workflow (role assignment step)
output functionPrincipalId string = fn.identity.principalId
output visionId string = vision.id
output translatorId string = translator.id
output speechId string = speech.id
output functionName string = fn.name

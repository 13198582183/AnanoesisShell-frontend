
# Host


## Properties

Name | Type
------------ | -------------
`id` | string
`host` | string
`port` | number
`username` | string
`authType` | [AuthType](AuthType.md)
`groupName` | string
`note` | string
`password` | string
`privateKey` | string
`passphrase` | string
`credentialSet` | boolean
`createdAt` | Date
`updatedAt` | Date

## Example

```typescript
import type { Host } from '@ananoesis/generated-api'

// TODO: Update the object below with actual values
const example = {
  "id": null,
  "host": 10.0.0.12,
  "port": null,
  "username": null,
  "authType": null,
  "groupName": null,
  "note": null,
  "password": null,
  "privateKey": null,
  "passphrase": null,
  "credentialSet": null,
  "createdAt": null,
  "updatedAt": null,
} satisfies Host

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as Host
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)



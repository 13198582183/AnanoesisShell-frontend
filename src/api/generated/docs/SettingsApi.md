# SettingsApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getSettings**](SettingsApi.md#getsettings) | **GET** /api/settings | 读取全局设置 |
| [**updateSettings**](SettingsApi.md#updatesettings) | **PUT** /api/settings | 更新全局设置 |



## getSettings

> Settings getSettings()

读取全局设置

### Example

```ts
import {
  Configuration,
  SettingsApi,
} from '@ananoesis/generated-api';
import type { GetSettingsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SettingsApi();

  try {
    const data = await api.getSettings();
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters

This endpoint does not need any parameter.

### Return type

[**Settings**](Settings.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 设置 |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateSettings

> Settings updateSettings(settings)

更新全局设置

### Example

```ts
import {
  Configuration,
  SettingsApi,
} from '@ananoesis/generated-api';
import type { UpdateSettingsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SettingsApi();

  const body = {
    // Settings
    settings: ...,
  } satisfies UpdateSettingsRequest;

  try {
    const data = await api.updateSettings(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **settings** | [Settings](Settings.md) |  | |

### Return type

[**Settings**](Settings.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 已更新 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


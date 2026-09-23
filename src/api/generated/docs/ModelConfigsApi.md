# ModelConfigsApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createModelConfig**](ModelConfigsApi.md#createmodelconfig) | **POST** /api/model-configs | 新增模型配置 |
| [**deleteModelConfig**](ModelConfigsApi.md#deletemodelconfig) | **DELETE** /api/model-configs/{id} | 删除模型配置 |
| [**getModelConfig**](ModelConfigsApi.md#getmodelconfig) | **GET** /api/model-configs/{id} | 查看单个模型配置 |
| [**listModelConfigs**](ModelConfigsApi.md#listmodelconfigs) | **GET** /api/model-configs | 模型配置列表 |
| [**setActiveModelConfig**](ModelConfigsApi.md#setactivemodelconfig) | **PUT** /api/model-configs/active | 切换当前生效的模型配置 |
| [**updateModelConfig**](ModelConfigsApi.md#updatemodelconfig) | **PUT** /api/model-configs/{id} | 编辑模型配置 |



## createModelConfig

> ModelConfig createModelConfig(modelConfig)

新增模型配置

### Example

```ts
import {
  Configuration,
  ModelConfigsApi,
} from '@ananoesis/generated-api';
import type { CreateModelConfigRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ModelConfigsApi();

  const body = {
    // ModelConfig
    modelConfig: ...,
  } satisfies CreateModelConfigRequest;

  try {
    const data = await api.createModelConfig(body);
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
| **modelConfig** | [ModelConfig](ModelConfig.md) |  | |

### Return type

[**ModelConfig**](ModelConfig.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | 已创建 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **503** | 凭据保护不可用（code&#x3D;credential_protection_unavailable） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## deleteModelConfig

> deleteModelConfig(id)

删除模型配置

### Example

```ts
import {
  Configuration,
  ModelConfigsApi,
} from '@ananoesis/generated-api';
import type { DeleteModelConfigRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ModelConfigsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteModelConfigRequest;

  try {
    const data = await api.deleteModelConfig(body);
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
| **id** | `string` |  | [Defaults to `undefined`] |

### Return type

`void` (Empty response body)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **204** | 已删除 |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **409** | 资源状态冲突（code&#x3D;conflict） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getModelConfig

> ModelConfig getModelConfig(id)

查看单个模型配置

### Example

```ts
import {
  Configuration,
  ModelConfigsApi,
} from '@ananoesis/generated-api';
import type { GetModelConfigRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ModelConfigsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetModelConfigRequest;

  try {
    const data = await api.getModelConfig(body);
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
| **id** | `string` |  | [Defaults to `undefined`] |

### Return type

[**ModelConfig**](ModelConfig.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 配置详情 |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listModelConfigs

> Array&lt;ModelConfig&gt; listModelConfigs()

模型配置列表

### Example

```ts
import {
  Configuration,
  ModelConfigsApi,
} from '@ananoesis/generated-api';
import type { ListModelConfigsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ModelConfigsApi();

  try {
    const data = await api.listModelConfigs();
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

[**Array&lt;ModelConfig&gt;**](ModelConfig.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 模型配置列表 |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setActiveModelConfig

> ModelConfig setActiveModelConfig(activeModelConfigRequest)

切换当前生效的模型配置

### Example

```ts
import {
  Configuration,
  ModelConfigsApi,
} from '@ananoesis/generated-api';
import type { SetActiveModelConfigRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ModelConfigsApi();

  const body = {
    // ActiveModelConfigRequest
    activeModelConfigRequest: ...,
  } satisfies SetActiveModelConfigRequest;

  try {
    const data = await api.setActiveModelConfig(body);
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
| **activeModelConfigRequest** | [ActiveModelConfigRequest](ActiveModelConfigRequest.md) |  | |

### Return type

[**ModelConfig**](ModelConfig.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 已切换 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateModelConfig

> ModelConfig updateModelConfig(id, modelConfig)

编辑模型配置

### Example

```ts
import {
  Configuration,
  ModelConfigsApi,
} from '@ananoesis/generated-api';
import type { UpdateModelConfigRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new ModelConfigsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // ModelConfig
    modelConfig: ...,
  } satisfies UpdateModelConfigRequest;

  try {
    const data = await api.updateModelConfig(body);
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
| **id** | `string` |  | [Defaults to `undefined`] |
| **modelConfig** | [ModelConfig](ModelConfig.md) |  | |

### Return type

[**ModelConfig**](ModelConfig.md)

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
| **404** | 资源不存在（code&#x3D;not_found） |  -  |
| **503** | 凭据保护不可用（code&#x3D;credential_protection_unavailable） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


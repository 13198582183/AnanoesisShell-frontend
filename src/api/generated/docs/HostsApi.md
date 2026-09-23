# HostsApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createHost**](HostsApi.md#createhost) | **POST** /api/hosts | 新增服务器配置 |
| [**deleteHost**](HostsApi.md#deletehost) | **DELETE** /api/hosts/{id} | 删除服务器配置 |
| [**getHost**](HostsApi.md#gethost) | **GET** /api/hosts/{id} | 查看单个服务器配置 |
| [**listHosts**](HostsApi.md#listhosts) | **GET** /api/hosts | 服务器配置列表 |
| [**updateHost**](HostsApi.md#updatehost) | **PUT** /api/hosts/{id} | 编辑既有服务器配置 |



## createHost

> Host createHost(host)

新增服务器配置

### Example

```ts
import {
  Configuration,
  HostsApi,
} from '@ananoesis/generated-api';
import type { CreateHostRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new HostsApi();

  const body = {
    // Host
    host: ...,
  } satisfies CreateHostRequest;

  try {
    const data = await api.createHost(body);
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
| **host** | [Host](Host.md) |  | |

### Return type

[**Host**](Host.md)

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


## deleteHost

> deleteHost(id)

删除服务器配置

### Example

```ts
import {
  Configuration,
  HostsApi,
} from '@ananoesis/generated-api';
import type { DeleteHostRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new HostsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies DeleteHostRequest;

  try {
    const data = await api.deleteHost(body);
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
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getHost

> Host getHost(id)

查看单个服务器配置

### Example

```ts
import {
  Configuration,
  HostsApi,
} from '@ananoesis/generated-api';
import type { GetHostRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new HostsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetHostRequest;

  try {
    const data = await api.getHost(body);
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

[**Host**](Host.md)

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


## listHosts

> Array&lt;Host&gt; listHosts()

服务器配置列表

### Example

```ts
import {
  Configuration,
  HostsApi,
} from '@ananoesis/generated-api';
import type { ListHostsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new HostsApi();

  try {
    const data = await api.listHosts();
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

[**Array&lt;Host&gt;**](Host.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 配置列表 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## updateHost

> Host updateHost(id, host)

编辑既有服务器配置

### Example

```ts
import {
  Configuration,
  HostsApi,
} from '@ananoesis/generated-api';
import type { UpdateHostRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new HostsApi();

  const body = {
    // string
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // Host
    host: ...,
  } satisfies UpdateHostRequest;

  try {
    const data = await api.updateHost(body);
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
| **host** | [Host](Host.md) |  | |

### Return type

[**Host**](Host.md)

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


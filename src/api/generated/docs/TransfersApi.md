# TransfersApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**cancelTransfer**](TransfersApi.md#canceltransfer) | **POST** /api/transfers/{id}/cancel | 取消传输任务（幂等） |
| [**claimDownloadTicket**](TransfersApi.md#claimdownloadticket) | **POST** /api/transfers/{id}/download-ticket | 领取下载票据 |
| [**createTransfer**](TransfersApi.md#createtransferoperation) | **POST** /api/sessions/{id}/transfers | 创建文件传输任务（design D9） |
| [**getTransfer**](TransfersApi.md#gettransfer) | **GET** /api/transfers/{id} | 查询传输任务状态 |



## cancelTransfer

> Transfer cancelTransfer(id)

取消传输任务（幂等）

### Example

```ts
import {
  Configuration,
  TransfersApi,
} from '@ananoesis/generated-api';
import type { CancelTransferRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new TransfersApi();

  const body = {
    // string | 传输任务 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies CancelTransferRequest;

  try {
    const data = await api.cancelTransfer(body);
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
| **id** | `string` | 传输任务 ID（V2） | [Defaults to `undefined`] |

### Return type

[**Transfer**](Transfer.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 取消结果 |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## claimDownloadTicket

> DownloadTicket claimDownloadTicket(id, xSessionControl)

领取下载票据

### Example

```ts
import {
  Configuration,
  TransfersApi,
} from '@ananoesis/generated-api';
import type { ClaimDownloadTicketRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new TransfersApi();

  const body = {
    // string | 传输任务 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string | 连接控制令牌（design D2）
    xSessionControl: xSessionControl_example,
  } satisfies ClaimDownloadTicketRequest;

  try {
    const data = await api.claimDownloadTicket(body);
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
| **id** | `string` | 传输任务 ID（V2） | [Defaults to `undefined`] |
| **xSessionControl** | `string` | 连接控制令牌（design D2） | [Defaults to `undefined`] |

### Return type

[**DownloadTicket**](DownloadTicket.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | 票据已领 |  -  |
| **409** | 传输状态不允许领票 |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createTransfer

> Transfer createTransfer(id, xSessionControl, createTransferRequest)

创建文件传输任务（design D9）

### Example

```ts
import {
  Configuration,
  TransfersApi,
} from '@ananoesis/generated-api';
import type { CreateTransferOperationRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new TransfersApi();

  const body = {
    // string | 连接实例 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string | 连接控制令牌（design D2）
    xSessionControl: xSessionControl_example,
    // CreateTransferRequest
    createTransferRequest: ...,
  } satisfies CreateTransferOperationRequest;

  try {
    const data = await api.createTransfer(body);
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
| **id** | `string` | 连接实例 ID（V2） | [Defaults to `undefined`] |
| **xSessionControl** | `string` | 连接控制令牌（design D2） | [Defaults to `undefined`] |
| **createTransferRequest** | [CreateTransferRequest](CreateTransferRequest.md) |  | |

### Return type

[**Transfer**](Transfer.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | 已创建传输任务 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **409** | 目标文件已存在（code&#x3D;transfer_conflict） |  -  |
| **429** | 传输队列已满（code&#x3D;transfer_quota_exceeded） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## getTransfer

> Transfer getTransfer(id)

查询传输任务状态

### Example

```ts
import {
  Configuration,
  TransfersApi,
} from '@ananoesis/generated-api';
import type { GetTransferRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new TransfersApi();

  const body = {
    // string | 传输任务 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
  } satisfies GetTransferRequest;

  try {
    const data = await api.getTransfer(body);
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
| **id** | `string` | 传输任务 ID（V2） | [Defaults to `undefined`] |

### Return type

[**Transfer**](Transfer.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 传输任务详情 |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


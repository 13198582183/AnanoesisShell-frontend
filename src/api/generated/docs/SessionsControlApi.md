# SessionsControlApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**closeSession**](SessionsControlApi.md#closesession) | **POST** /api/sessions/{id}/close | 关闭连接实例 |
| [**createSession**](SessionsControlApi.md#createsessionoperation) | **POST** /api/sessions | 创建连接实例（返回一次性 control_token；design D2） |
| [**createSessionConversation**](SessionsControlApi.md#createsessionconversation) | **POST** /api/sessions/{id}/conversations | 在连接内创建对话 |
| [**listSessionConversations**](SessionsControlApi.md#listsessionconversations) | **GET** /api/sessions/{id}/conversations | 列出连接内对话（keyset 分页） |
| [**setActiveConversation**](SessionsControlApi.md#setactiveconversation) | **PUT** /api/sessions/{id}/active-conversation | 选择连接内活动对话 |



## closeSession

> closeSession(id, xSessionControl)

关闭连接实例

### Example

```ts
import {
  Configuration,
  SessionsControlApi,
} from '@ananoesis/generated-api';
import type { CloseSessionRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SessionsControlApi();

  const body = {
    // string | 连接实例 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string | 连接控制令牌（design D2）
    xSessionControl: xSessionControl_example,
  } satisfies CloseSessionRequest;

  try {
    const data = await api.closeSession(body);
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
| **204** | 已关闭 |  -  |
| **403** | 控制凭证错误（code&#x3D;session_control_invalid） |  -  |
| **404** | 资源不存在（code&#x3D;not_found） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createSession

> SessionCreated createSession(createSessionRequest)

创建连接实例（返回一次性 control_token；design D2）

### Example

```ts
import {
  Configuration,
  SessionsControlApi,
} from '@ananoesis/generated-api';
import type { CreateSessionOperationRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SessionsControlApi();

  const body = {
    // CreateSessionRequest
    createSessionRequest: ...,
  } satisfies CreateSessionOperationRequest;

  try {
    const data = await api.createSession(body);
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
| **createSessionRequest** | [CreateSessionRequest](CreateSessionRequest.md) |  | |

### Return type

[**SessionCreated**](SessionCreated.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | 已创建（control_token 仅此次响应展示） |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## createSessionConversation

> Conversation createSessionConversation(id, xSessionControl, sessionConversationCreate)

在连接内创建对话

### Example

```ts
import {
  Configuration,
  SessionsControlApi,
} from '@ananoesis/generated-api';
import type { CreateSessionConversationRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SessionsControlApi();

  const body = {
    // string | 连接实例 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string | 连接控制令牌（design D2）
    xSessionControl: xSessionControl_example,
    // SessionConversationCreate (optional)
    sessionConversationCreate: ...,
  } satisfies CreateSessionConversationRequest;

  try {
    const data = await api.createSessionConversation(body);
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
| **sessionConversationCreate** | [SessionConversationCreate](SessionConversationCreate.md) |  | [Optional] |

### Return type

[**Conversation**](Conversation.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | 已创建（含 session_id） |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## listSessionConversations

> ConversationListResponse listSessionConversations(id, cursor, limit)

列出连接内对话（keyset 分页）

### Example

```ts
import {
  Configuration,
  SessionsControlApi,
} from '@ananoesis/generated-api';
import type { ListSessionConversationsRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SessionsControlApi();

  const body = {
    // string | 连接实例 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string (optional)
    cursor: cursor_example,
    // number (optional)
    limit: 56,
  } satisfies ListSessionConversationsRequest;

  try {
    const data = await api.listSessionConversations(body);
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
| **cursor** | `string` |  | [Optional] [Defaults to `undefined`] |
| **limit** | `number` |  | [Optional] [Defaults to `30`] |

### Return type

[**ConversationListResponse**](ConversationListResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | 对话分页列表 |  -  |
| **400** | 请求校验失败（code&#x3D;validation_error） |  -  |
| **500** | 服务器内部错误（code&#x3D;internal_error） |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## setActiveConversation

> setActiveConversation(id, xSessionControl, activeConversationRequest)

选择连接内活动对话

### Example

```ts
import {
  Configuration,
  SessionsControlApi,
} from '@ananoesis/generated-api';
import type { SetActiveConversationRequest } from '@ananoesis/generated-api';

async function example() {
  console.log("🚀 Testing @ananoesis/generated-api SDK...");
  const api = new SessionsControlApi();

  const body = {
    // string | 连接实例 ID（V2）
    id: 38400000-8cf0-11bd-b23e-10b96e4ef00d,
    // string | 连接控制令牌（design D2）
    xSessionControl: xSessionControl_example,
    // ActiveConversationRequest
    activeConversationRequest: ...,
  } satisfies SetActiveConversationRequest;

  try {
    const data = await api.setActiveConversation(body);
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
| **activeConversationRequest** | [ActiveConversationRequest](ActiveConversationRequest.md) |  | |

### Return type

`void` (Empty response body)

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

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


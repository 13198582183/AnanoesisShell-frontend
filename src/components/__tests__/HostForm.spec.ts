import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HostForm from '@/components/HostForm.vue'
import type { Host } from '@/api'

/**
 * HostForm 组件测试（task 5.2）
 * WHY: 验证服务器配置表单的新增/编辑行为、认证方式切换（password/private_key）、
 *      以及 writeOnly 凭据字段"不回显、留空保持不变"的契约要求。
 */
describe('HostForm.vue', () => {
  function findInput(wrapper: ReturnType<typeof mount>, name: string) {
    return wrapper.find(`[data-field="${name}"]`)
  }

  it('新增模式下渲染空表单，提交必填字段后 emit submit 载荷', async () => {
    const wrapper = mount(HostForm, { props: { modelValue: null } })

    await findInput(wrapper, 'host').setValue('10.0.0.1')
    await findInput(wrapper, 'port').setValue('22')
    await findInput(wrapper, 'username').setValue('root')
    await findInput(wrapper, 'password').setValue('secret')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeTruthy()
    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        host: '10.0.0.1',
        port: 22,
        username: 'root',
        authType: 'password',
        groupName: undefined,
        note: undefined,
        password: 'secret',
        privateKey: undefined,
        passphrase: undefined,
      },
    ])
  })

  it('切换认证方式为 private_key 时展示私钥/passphrase 字段，隐藏密码字段', async () => {
    const wrapper = mount(HostForm, { props: { modelValue: null } })

    await findInput(wrapper, 'authType').setValue('private_key')

    expect(findInput(wrapper, 'password').exists()).toBe(false)
    expect(findInput(wrapper, 'privateKey').exists()).toBe(true)
    expect(findInput(wrapper, 'passphrase').exists()).toBe(true)
  })

  it('private_key 模式下提交 payload 只含 privateKey/passphrase，不含 password', async () => {
    const wrapper = mount(HostForm, { props: { modelValue: null } })

    await findInput(wrapper, 'host').setValue('10.0.0.2')
    await findInput(wrapper, 'port').setValue('22')
    await findInput(wrapper, 'username').setValue('deploy')
    await findInput(wrapper, 'authType').setValue('private_key')
    await findInput(wrapper, 'privateKey').setValue('-----BEGIN KEY-----')
    await findInput(wrapper, 'passphrase').setValue('key-pass')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        host: '10.0.0.2',
        port: 22,
        username: 'deploy',
        authType: 'private_key',
        groupName: undefined,
        note: undefined,
        password: undefined,
        privateKey: '-----BEGIN KEY-----',
        passphrase: 'key-pass',
      },
    ])
  })

  it('编辑模式下凭据字段留空提交时，password/privateKey/passphrase 均为 undefined（不回显、不覆盖）', async () => {
    const existing: Host = {
      id: 'host-1',
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      authType: 'password',
      credentialSet: true,
    }
    const wrapper = mount(HostForm, { props: { modelValue: existing } })

    // WHY: 表单应基于既有配置回填非凭据字段，但凭据字段必须保持空白（writeOnly 不回显）
    expect((findInput(wrapper, 'host').element as HTMLInputElement).value).toBe('10.0.0.1')
    expect((findInput(wrapper, 'password').element as HTMLInputElement).value).toBe('')

    await findInput(wrapper, 'host').setValue('10.0.0.99')
    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        host: '10.0.0.99',
        port: 22,
        username: 'root',
        authType: 'password',
        groupName: undefined,
        note: undefined,
        password: undefined,
        privateKey: undefined,
        passphrase: undefined,
      },
    ])
  })

  it('编辑模式且已配置凭据时，展示"已配置"掩码提示而非明文', () => {
    const existing: Host = {
      id: 'host-1',
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      authType: 'password',
      credentialSet: true,
    }
    const wrapper = mount(HostForm, { props: { modelValue: existing } })

    expect(wrapper.text()).toContain('已配置')
    expect(wrapper.text()).not.toContain('secret')
  })

  it('必填字段缺失时不 emit submit，展示校验错误', async () => {
    const wrapper = mount(HostForm, { props: { modelValue: null } })

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="host"]').exists()).toBe(true)
  })

  it('新增模式且认证方式为 password 时，密码为必填', async () => {
    const wrapper = mount(HostForm, { props: { modelValue: null } })

    await findInput(wrapper, 'host').setValue('10.0.0.1')
    await findInput(wrapper, 'port').setValue('22')
    await findInput(wrapper, 'username').setValue('root')

    await wrapper.find('[data-action="submit"]').trigger('click')

    expect(wrapper.emitted('submit')).toBeFalsy()
    expect(wrapper.find('[data-error="password"]').exists()).toBe(true)
  })

  it('点击取消按钮 emit cancel', async () => {
    const wrapper = mount(HostForm, { props: { modelValue: null } })

    await wrapper.find('[data-action="cancel"]').trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})

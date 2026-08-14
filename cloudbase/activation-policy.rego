package authz.user

default allow := false

# 仅开放云函数网关；activation-gateway 仍会在函数内部读取并校验真实 CloudBase UID。
# 数据库和存储没有 allow 规则，因此浏览器不能直接访问 activation_codes / activation_attempts。
allow if {
  input.cloudbase.resource_type == "functions"
}
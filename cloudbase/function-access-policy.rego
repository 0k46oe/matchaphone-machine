package authz.user

default allow := false

# 仅允许通过受控云函数访问项目服务；数据库和存储不直接开放给浏览器。
allow if {
  input.cloudbase.resource_type == "functions"
}

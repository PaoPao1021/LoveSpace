$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$miniRoot = Join-Path $projectRoot 'miniprogram'
$cloudRoot = Join-Path $projectRoot 'cloudfunctions'
$errors = [System.Collections.Generic.List[string]]::new()

function Test-JsonFile([string]$path) {
  try {
    Get-Content -LiteralPath $path -Raw -Encoding utf8 | ConvertFrom-Json | Out-Null
  } catch {
    $errors.Add("JSON 无法解析: $path")
  }
}

$appConfigPath = Join-Path $miniRoot 'app.json'
Test-JsonFile $appConfigPath
$appConfig = Get-Content -LiteralPath $appConfigPath -Raw -Encoding utf8 | ConvertFrom-Json

foreach ($page in $appConfig.pages) {
  foreach ($extension in '.js', '.json', '.wxml', '.wxss') {
    $pageFile = Join-Path $miniRoot ($page + $extension)
    if (-not (Test-Path -LiteralPath $pageFile)) {
      $errors.Add("页面文件缺失: $pageFile")
    }
  }
}

$jsonFiles = @(
  Get-ChildItem -LiteralPath $miniRoot -Recurse -File -Filter '*.json' |
    Where-Object { $_.Name -ne 'package-lock.json' -and $_.FullName -notmatch '\\(node_modules|miniprogram_npm)\\' }
  Get-ChildItem -LiteralPath $cloudRoot -Recurse -File -Filter '*.json' |
    Where-Object { $_.Name -ne 'package-lock.json' -and $_.FullName -notmatch '\\node_modules\\' }
  Get-Item -LiteralPath (Join-Path $projectRoot 'project.config.json')
)
$jsonFiles | ForEach-Object { Test-JsonFile $_.FullName }

$componentJsonFiles = Get-ChildItem -LiteralPath $miniRoot -Recurse -File -Filter '*.json' |
  Where-Object { $_.Name -ne 'package-lock.json' -and $_.FullName -notmatch '\\(node_modules|miniprogram_npm)\\' }
foreach ($file in $componentJsonFiles) {
  $config = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8 | ConvertFrom-Json
  if ($config.usingComponents) {
    $wxmlPath = [IO.Path]::ChangeExtension($file.FullName, '.wxml')
    $markup = if (Test-Path -LiteralPath $wxmlPath) { Get-Content -LiteralPath $wxmlPath -Raw -Encoding utf8 } else { '' }
    foreach ($property in $config.usingComponents.PSObject.Properties) {
      $componentPath = [string]$property.Value
      if ($componentPath.StartsWith('/')) {
        $relative = $componentPath.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
        $target = Join-Path $miniRoot ($relative + '.json')
        if (-not (Test-Path -LiteralPath $target)) {
          $errors.Add("组件路径不存在: $($file.FullName) -> $componentPath")
        }
      }
      if ($markup -and $markup -notmatch ('<' + [regex]::Escape($property.Name) + '(?:\s|/|>)')) {
        $errors.Add("页面声明了未使用的组件: $($file.FullName) -> $($property.Name)")
      }
    }
  }
}

$jsFiles = @(
  Get-ChildItem -LiteralPath $miniRoot -Recurse -File -Filter '*.js' |
    Where-Object { $_.FullName -notmatch '\\(node_modules|miniprogram_npm)\\' }
  Get-ChildItem -LiteralPath $cloudRoot -Recurse -File -Filter 'index.js'
)

foreach ($file in $jsFiles) {
  & node --check $file.FullName 2>$null
  if ($LASTEXITCODE -ne 0) {
    $errors.Add("JavaScript 语法错误: $($file.FullName)")
  }
}

$businessJs = Get-ChildItem -LiteralPath $miniRoot -Recurse -File -Filter '*.js' |
  Where-Object { $_.FullName -notmatch '\\(node_modules|miniprogram_npm)\\' }
foreach ($file in $businessJs) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
  if ($content -match 'wx\.cloud\.database\s*\(') {
    $errors.Add("前端不应直接访问数据库: $($file.FullName)")
  }
}

$wxmlPages = Get-ChildItem -LiteralPath (Join-Path $miniRoot 'pages') -Recurse -File -Filter '*.wxml'
foreach ($file in $wxmlPages) {
  $jsPath = [IO.Path]::ChangeExtension($file.FullName, '.js')
  if (-not (Test-Path -LiteralPath $jsPath)) { continue }
  $markup = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
  $script = Get-Content -LiteralPath $jsPath -Raw -Encoding utf8
  $bindings = [regex]::Matches($markup, '(?:bind|catch)(?:tap|input|change|submit|confirm|longpress|close|cancel|scrolltolower|refresherrefresh|chooseavatar)\s*=\s*["'']([A-Za-z_$][\w$]*)["'']')
  foreach ($binding in $bindings) {
    $handler = $binding.Groups[1].Value
    if ($script -notmatch ([regex]::Escape($handler) + '\s*\(')) {
      $errors.Add("WXML 事件处理函数不存在: $($file.FullName) -> $handler")
    }
  }
}

$cloudFunctions = Get-ChildItem -LiteralPath $cloudRoot -Directory |
  Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'index.js') }
foreach ($function in $cloudFunctions) {
  $packagePath = Join-Path $function.FullName 'package.json'
  if (-not (Test-Path -LiteralPath $packagePath)) {
    $errors.Add("云函数缺少 package.json: $($function.FullName)")
    continue
  }
  $packageText = Get-Content -LiteralPath $packagePath -Raw -Encoding utf8
  if ($packageText -match '"wx-server-sdk"\s*:\s*"latest"') {
    $errors.Add("云函数依赖不可使用 latest: $packagePath")
  }
}

$configPath = Join-Path $miniRoot 'config\index.js'
if (-not (Test-Path -LiteralPath $configPath)) {
  $errors.Add("缺少上线配置: $configPath")
} else {
  $configText = Get-Content -LiteralPath $configPath -Raw -Encoding utf8
  if ($configText -match 'your-cloud-env|请替换|TODO') {
    $errors.Add("上线配置仍包含占位值: $configPath")
  }
}

$allCloudJs = Get-ChildItem -LiteralPath $cloudRoot -Recurse -File -Filter '*.js' |
  Where-Object { $_.FullName -notmatch '\\node_modules\\' }
foreach ($file in $allCloudJs) {
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
  if ($content -match "templateId\s*:\s*''") {
    $errors.Add("订阅消息模板 ID 为空: $($file.FullName)")
  }
}

if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Error $_ }
  exit 1
}

$devToolsModules = 'C:\Program Files (x86)\Tencent\微信web开发者工具\code\package.nw\node_modules\wcc-exec'
$wcc = Join-Path $devToolsModules 'wcc.exe'
$wcsc = Join-Path $devToolsModules 'wcsc.exe'
if ((Test-Path -LiteralPath $wcc) -and (Test-Path -LiteralPath $wcsc)) {
  $tempBase = [IO.Path]::GetTempPath()
  $compileTemp = Join-Path $tempBase ('lovespace-validate-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $compileTemp | Out-Null
  try {
    $wxmlFiles = Get-ChildItem -LiteralPath $miniRoot -Recurse -File -Filter '*.wxml' |
      Where-Object { $_.FullName -notmatch '\\(node_modules|miniprogram_npm)\\' }
    foreach ($file in $wxmlFiles) {
      $output = Join-Path $compileTemp ([guid]::NewGuid().ToString('N') + '.js')
      & $wcc -d -o $output $file.FullName 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "WXML 编译失败: $($file.FullName)" }
    }

    $wxssFiles = Get-ChildItem -LiteralPath $miniRoot -Recurse -File -Filter '*.wxss' |
      Where-Object { $_.FullName -notmatch '\\(node_modules|miniprogram_npm)\\' }
    foreach ($file in $wxssFiles) {
      $output = Join-Path $compileTemp ([guid]::NewGuid().ToString('N') + '.js')
      & $wcsc -lc -js -o $output $file.FullName 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "WXSS 编译失败: $($file.FullName)" }
    }
  } finally {
    if ($compileTemp.StartsWith($tempBase) -and (Test-Path -LiteralPath $compileTemp)) {
      Remove-Item -LiteralPath $compileTemp -Recurse -Force
    }
  }
}

Write-Host "LoveSpace validation passed: $($appConfig.pages.Count) pages, $($jsFiles.Count) scripts, $($jsonFiles.Count) JSON files, $($cloudFunctions.Count) cloud functions."

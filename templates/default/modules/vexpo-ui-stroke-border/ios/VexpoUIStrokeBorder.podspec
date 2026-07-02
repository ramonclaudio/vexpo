Pod::Spec.new do |s|
  s.name           = 'VexpoUIStrokeBorder'
  s.version        = '1.0.0'
  s.summary        = 'strokeBorder modifier, vendored from expo/expo#47426'
  s.description    = 'Registers the strokeBorder SwiftUI modifier merged in expo/expo#47426 through the public ViewModifierRegistry API, until a released @expo/ui ships it. Delete this module when it does.'
  s.author         = 'vexpo'
  s.homepage       = 'https://github.com/ramonclaudio/vexpo'
  s.license        = 'MIT'
  s.platforms      = { :ios => '16.4', :tvos => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoUI'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end

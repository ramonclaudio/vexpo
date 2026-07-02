Pod::Spec.new do |s|
  s.name           = 'VexpoUITraits'
  s.version        = '1.0.0'
  s.summary        = 'accessibilityAddTraits and accessibilityRemoveTraits, vendored from expo/expo#47387'
  s.description    = 'Registers the accessibilityAddTraits and accessibilityRemoveTraits SwiftUI modifiers merged in expo/expo#47387 through the public ViewModifierRegistry API, until a released @expo/ui ships them. Delete this module when it does.'
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

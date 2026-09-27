Pod::Spec.new do |s|
  s.name           = 'NotificationActionTime'
  s.version        = '1.0.0'
  s.summary        = 'Keeps the app running while a notification Reply / Mark as read is sent.'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'DateToday'
  s.homepage       = 'https://github.com/expo/expo'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoNotifications'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end

#ifndef PRISM_PULSE_CONFIG_H
#define PRISM_PULSE_CONFIG_H

// PRISM PULSE — Build-time configuration
// Override any value with a compiler flag, e.g.:
//   -DWIFI_SSID=\"MyNetwork\" -DWIFI_PASSWORD=\"secret\"

#ifndef WIFI_SSID
#define WIFI_SSID "Galaxy A23 5G F647"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "123456789"
#endif

#ifndef ESP32_BRIDGE_URL
#define ESP32_BRIDGE_URL "http://192.168.180.97:8081"
#endif

#ifndef DEVICE_JWT
#define DEVICE_JWT ""
#endif

#endif // PRISM_PULSE_CONFIG_H

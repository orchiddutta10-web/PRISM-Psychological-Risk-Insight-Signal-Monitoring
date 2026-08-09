#ifndef PRISM_PULSE_CONFIG_H
#define PRISM_PULSE_CONFIG_H

// PRISM PULSE — Build-time configuration
// Override any value with a compiler flag, e.g.:
//   -DWIFI_SSID=\"MyNetwork\" -DWIFI_PASSWORD=\"secret\"

#ifndef WIFI_SSID
#define WIFI_SSID "AndroidShare_RS"
#endif

#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "orchid@12345"
#endif

#ifndef PRISM_API_URL
#define PRISM_API_URL "http://10.167.54.97:8081"
#endif

#ifndef ESP32_BRIDGE_URL
#define ESP32_BRIDGE_URL "http://10.167.54.97:8081"
#endif

#ifndef DEVICE_JWT
#define DEVICE_JWT ""
#endif

#ifndef BRIDGE_TOKEN
#define BRIDGE_TOKEN ""
#endif

#endif // PRISM_PULSE_CONFIG_H

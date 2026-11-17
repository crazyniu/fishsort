cmake_minimum_required(VERSION 3.8)

set(CMAKE_SYSTEM_NAME iOS)
set(APP_NAME "CocosGame"  CACHE STRING "Project Name")

project(${APP_NAME} CXX)

set(CC_PROJECT_DIR ${CMAKE_CURRENT_LIST_DIR})
set(CC_UI_RESOURCES)
set(CC_PROJ_SOURCES)
set(CC_ASSET_FILES)
set(CC_COMMON_SOURCES)
set(CC_ALL_SOURCES)

include(${CC_PROJECT_DIR}/../common/CMakeLists.txt)
set(EXECUTABLE_NAME ${APP_NAME}-mobile)

# 我们自己的原生代码：脚本和原生之间的桥（docs/04 第 5 节）
list(APPEND CC_PROJ_SOURCES
    ${CC_PROJECT_DIR}/game/FsBridge.h
    ${CC_PROJECT_DIR}/game/FsBridge.mm
)

cc_ios_before_target(${EXECUTABLE_NAME})
add_executable(${EXECUTABLE_NAME} ${CC_ALL_SOURCES})
cc_ios_after_target(${EXECUTABLE_NAME})

# 只做 iPhone 版（docs/06 第 3 节），在 iPad 上按 iPhone 比例运行
set_target_properties(${EXECUTABLE_NAME} PROPERTIES XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1")

# Google Mobile Ads + UMP：./run.sh ios-build 下载到 sdk/（不进仓库）。CMake 3.24 不能直接链 xcframework，
# 按真机 / 模拟器分别指到各自的切片目录。没下载时跳过，桥里按没有广告编译
set(FS_SDK_DIR ${CC_PROJECT_DIR}/sdk)
if(EXISTS ${FS_SDK_DIR}/GoogleMobileAds.xcframework)
    set(FS_DEVICE_PATHS "")
    set(FS_SIM_PATHS "")
    foreach(fw GoogleMobileAds UserMessagingPlatform)
        file(GLOB FS_DEVICE_SLICE LIST_DIRECTORIES true "${FS_SDK_DIR}/${fw}.xcframework/ios-arm64")
        file(GLOB FS_SIM_SLICE LIST_DIRECTORIES true "${FS_SDK_DIR}/${fw}.xcframework/ios-*simulator")
        list(APPEND FS_DEVICE_PATHS ${FS_DEVICE_SLICE})
        list(APPEND FS_SIM_PATHS ${FS_SIM_SLICE})
    endforeach()
    string(REPLACE ";" " " FS_DEVICE_PATHS "${FS_DEVICE_PATHS}")
    string(REPLACE ";" " " FS_SIM_PATHS "${FS_SIM_PATHS}")
    set_target_properties(${EXECUTABLE_NAME} PROPERTIES
        XCODE_ATTRIBUTE_FRAMEWORK_SEARCH_PATHS[sdk=iphoneos*] "$(inherited) ${FS_DEVICE_PATHS}"
        XCODE_ATTRIBUTE_FRAMEWORK_SEARCH_PATHS[sdk=iphonesimulator*] "$(inherited) ${FS_SIM_PATHS}"
    )
    target_link_libraries(${EXECUTABLE_NAME}
        "-ObjC"
        "-framework GoogleMobileAds"
        "-framework UserMessagingPlatform"
        "-framework AppTrackingTransparency"
        "-framework JavaScriptCore"
        "-framework StoreKit"
        "-framework WebKit"
    )
else()
    target_link_libraries(${EXECUTABLE_NAME} "-framework AppTrackingTransparency")
endif()

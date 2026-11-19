cmake_minimum_required(VERSION 3.8)

set(CMAKE_SYSTEM_NAME iOS)
set(APP_NAME "BubbleFish"  CACHE STRING "Project Name")

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

# 各语言的应用名（<语言>.lproj/InfoPlist.strings，tools/native/apply.mjs 按 game.json 生成）。
# Cocos 的模板只把 Base.lproj 里的启动屏和 Localizable.strings 打进包；列进资源表又会被摊平到包根目录、同名文件互相覆盖，
# 所以构建完（签名之前）按目录拷进 .app。FS_LPROJ 由 apply.mjs 改写
set(FS_LPROJ Base en zh-Hans zh-Hant ja ko de fr es pt-BR it ru tr)
foreach(d ${FS_LPROJ})
    add_custom_command(TARGET ${EXECUTABLE_NAME} POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_BUNDLE_DIR:${EXECUTABLE_NAME}>/${d}.lproj"
        COMMAND ${CMAKE_COMMAND} -E copy "${CC_PROJECT_DIR}/${d}.lproj/InfoPlist.strings" "$<TARGET_BUNDLE_DIR:${EXECUTABLE_NAME}>/${d}.lproj/InfoPlist.strings")
endforeach()

# Xcode 27 的 libc++ 不许特化 std::is_floating_point 等（引擎带的 enoki/half.h 这么做了），这条诊断默认是错误，降成警告
foreach(t cocos_engine ${EXECUTABLE_NAME})
    if(TARGET ${t})
        target_compile_options(${t} PRIVATE -Wno-invalid-specialization)
    endif()
endforeach()

# Cocos 3.8.8 预编译的 libwebp.a 成员没按 8 字节对齐，Xcode 27 的新链接器会丢掉它们、链接失败。
# ./package.sh 选择 iOS 时 用 Xcode 的 libtool 重新打包一份对齐的放到 sdk/libwebp/（不进仓库），这里把引擎的 webp 目标指过去
if(TARGET webp AND EXISTS ${CC_PROJECT_DIR}/sdk/libwebp/libwebp.a)
    set_target_properties(webp PROPERTIES IMPORTED_LOCATION ${CC_PROJECT_DIR}/sdk/libwebp/libwebp.a)
endif()

# 只做 iPhone 版（docs/06 第 3 节），在 iPad 上按 iPhone 比例运行
set_target_properties(${EXECUTABLE_NAME} PROPERTIES XCODE_ATTRIBUTE_TARGETED_DEVICE_FAMILY "1")

# Google Mobile Ads + UMP：./package.sh 选择 iOS 时 下载到 sdk/（不进仓库）。CMake 3.24 不能直接链 xcframework，
# 按真机 / 模拟器分别指到各自的切片目录。没下载、或 game.json 关了广告（FS_ADS OFF）时不链，桥里按没有广告编译
# FS_ADS 由 tools/native/apply.mjs 按 game.json 的 ads.enabled 改写
set(FS_ADS OFF)
set(FS_SDK_DIR ${CC_PROJECT_DIR}/sdk)
if(FS_ADS AND EXISTS ${FS_SDK_DIR}/GoogleMobileAds.xcframework)
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
    # 广告 SDK 里有 Swift 代码：工程里没有 Swift 文件，Xcode 不会自动链 Swift 运行时，手动加搜索路径和三个兼容库
    # （CMake 3.24 在 Xcode 27 下 enable_language(Swift) 找不到编译器，只能这样）
    set_target_properties(${EXECUTABLE_NAME} PROPERTIES
        XCODE_ATTRIBUTE_LIBRARY_SEARCH_PATHS "$(inherited) $(SDKROOT)/usr/lib/swift $(TOOLCHAIN_DIR)/usr/lib/swift/$(PLATFORM_NAME)"
        XCODE_ATTRIBUTE_LD_RUNPATH_SEARCH_PATHS "$(inherited) /usr/lib/swift @executable_path/Frameworks"
    )
    target_link_libraries(${EXECUTABLE_NAME}
        "-lswiftCompatibility51"
        "-lswiftCompatibility56"
        "-lswiftCompatibilityConcurrency"
        "-ObjC"
        "-framework GoogleMobileAds"
        "-framework UserMessagingPlatform"
        "-framework AppTrackingTransparency"
        "-framework JavaScriptCore"
        "-framework StoreKit"
        "-framework WebKit"
    )
endif()

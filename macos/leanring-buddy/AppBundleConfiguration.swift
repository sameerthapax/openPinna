//
//  AppBundleConfiguration.swift
//  leanring-buddy
//
//  Shared helper for reading runtime configuration from the built app bundle.
//

import Foundation

enum AppBundleConfiguration {
    static func stringValue(forKey key: String) -> String? {
        if let overrideValue = UserDefaults.standard.string(forKey: key) {
            let trimmedOverrideValue = overrideValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedOverrideValue.isEmpty {
                return trimmedOverrideValue
            }
        }

        if let value = Bundle.main.object(forInfoDictionaryKey: key) as? String {
            let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmedValue.isEmpty {
                return trimmedValue
            }
        }

        guard let resourceInfoPath = Bundle.main.path(forResource: "Info", ofType: "plist"),
              let resourceInfo = NSDictionary(contentsOfFile: resourceInfoPath),
              let value = resourceInfo[key] as? String else {
            return nil
        }

        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue.isEmpty ? nil : trimmedValue
    }

    static func backendBaseURL() -> String {
        stringValue(forKey: "OpenPinnaBackendBaseURL") ?? "http://localhost:3000"
    }
}

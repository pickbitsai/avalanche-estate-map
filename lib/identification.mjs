// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Mark Pickering and PICKBITS LLC. Part of Avalanche Estate Map by PickBits.
// IRE-lite deterministic identification. Class definitions and ordered identifying attributes
// are data in config.example.mjs, not branches in this module.

const required = (value, label) => {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
};

export function ciKey(className, attrs, identificationRules) {
  const klass = required(className, "CI class");
  const ordered = identificationRules?.[klass];
  if (!Array.isArray(ordered) || !ordered.length) {
    throw new Error(`no identification rule configured for class "${klass}"`);
  }
  const values = ordered.map((attribute) => {
    const value = attrs?.[attribute];
    if (value == null || (typeof value === "string" && !value.trim())) {
      throw new Error(`identifying attribute "${attribute}" is required for class "${klass}"`);
    }
    return String(value).trim();
  });
  return `${klass}:${values.join("|")}`;
}

export function identifiedCI({ class: className, name, attrs = {} }, settings) {
  return {
    ci_key: ciKey(className, attrs, settings.identificationRules),
    class: className,
    name: required(name, "CI name"),
    attrs,
  };
}

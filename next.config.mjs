// src/db (Person A) imports with ".js" suffixes (NodeNext style); webpack must map them to the .ts sources.
export default {
  agentRules: false,
  serverExternalPackages: ["mongodb", "@xenova/transformers", "onnxruntime-node", "sharp"],
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

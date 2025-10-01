import os
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

_kv_client = None

def kv_client():
    global _kv_client
    if _kv_client is None:
        uri = os.environ["KEYVAULT_URI"]
        _kv_client = SecretClient(vault_url=uri, credential=DefaultAzureCredential())
    return _kv_client

def get_secret(name: str) -> str:
    return kv_client().get_secret(name).value

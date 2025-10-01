import os
from azure.search.documents.indexes.models import (
    SearchIndex, SimpleField, SearchField, SearchFieldDataType,
    VectorSearch, HnswAlgorithmConfiguration, VectorSearchAlgorithmKind, VectorSearchProfile
)

def build_index(name: str, dims: int | None = None) -> SearchIndex:
    if dims is None:
        # default to 1536 which matches text-embedding-3-small
        dims = int(os.getenv("EMBEDDING_DIMS", "1536"))
    fields = [
        SimpleField(name="id", type=SearchFieldDataType.String, key=True),
        SearchField(name="content", type=SearchFieldDataType.String, searchable=True),
        SimpleField(name="source", type=SearchFieldDataType.String),
        SearchField(name="contentVector", type=SearchFieldDataType.Collection(SearchFieldDataType.Single),
                    searchable=True, vector_search_dimensions=dims, vector_search_profile_name="vprofile"),
    ]
    vector_search = VectorSearch(algorithm_configurations=[
        HnswAlgorithmConfiguration(name="hnsw", kind=VectorSearchAlgorithmKind.HNSW)
    ], profiles=[VectorSearchProfile(name="vprofile", algorithm_configuration_name="hnsw")])
    return SearchIndex(name=name, fields=fields, vector_search=vector_search)

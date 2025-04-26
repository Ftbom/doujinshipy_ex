package eu.kanade.tachiyomi.extension.all.doujinshione

import kotlinx.serialization.Serializable

// doujinshi信息
@Serializable
data class Doujinshi(
    val id: String,
    val tags: List<String>,
    val translated_tags: List<String>?,
    val groups: List<String>,
    val title: String,
    val source: String,
    val cover: String,
)

// doujinshi数据
@Serializable
data class DoujinshiData(
    val doujinshis: List<Doujinshi>,
    val total: Int,
    val page: Int,
    val pageSize: Int,
)

// doujinshi结果列表
@Serializable
data class DoujinshiResult(
    val msg: String,
    val data: DoujinshiData,
)

// doujinshi结果
@Serializable
data class DoujinshiMetadata(
    val msg: String,
    val data: Doujinshi,
)

// doujinshi页面结果
@Serializable
data class DoujinshiPage(
    val msg: String,
    val data: List<String>,
)

// doujinshi web页面
@Serializable
data class DoujinshiWebPage(
    val urls: List<String>,
    val headers: Map<String, String>,
)

// doujinshi页面结果
@Serializable
data class DoujinshiPage2(
    val msg: String,
    val data: DoujinshiWebPage,
)

// doujinshi web单页面
@Serializable
data class DoujinshiSingleWebPage(
    val url: String,
    val headers: Map<String, String>,
)

// doujinshi单页面结果
@Serializable
data class DoujinshiPageInfo(
    val msg: String,
    val data: DoujinshiSingleWebPage,
)

// group信息
@Serializable
data class Group(
    val id: String,
    val name: String,
)

// group doujinshi列表
@Serializable
data class GroupResult(
    val msg: String,
    val data: List<Group>,
)

// 服务器设置
@Serializable
data class ServerSettings(
    val proxy_webpage: Boolean,
    val max_num_perpage: Int,
)

// 服务器信息
@Serializable
data class ServerInfo(
    val info: ServerSettings,
    val sources: Map<String, SourceDetail>,
    val batch_operations: Map<String, List<Map<String, String>>>,
)

// source信息
@Serializable
data class SourceDetail(
    val description: String,
    val web: Boolean,
)

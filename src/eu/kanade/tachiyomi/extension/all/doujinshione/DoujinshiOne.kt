package eu.kanade.tachiyomi.extension.all.doujinshione

import android.app.Application
import android.content.SharedPreferences
import android.net.Uri
import android.text.InputType
import android.widget.Toast
import androidx.preference.ListPreference
import eu.kanade.tachiyomi.network.GET
import eu.kanade.tachiyomi.network.asObservableSuccess
import eu.kanade.tachiyomi.source.ConfigurableSource
import eu.kanade.tachiyomi.source.UnmeteredSource
import eu.kanade.tachiyomi.source.model.Filter
import eu.kanade.tachiyomi.source.model.FilterList
import eu.kanade.tachiyomi.source.model.MangasPage
import eu.kanade.tachiyomi.source.model.Page
import eu.kanade.tachiyomi.source.model.SChapter
import eu.kanade.tachiyomi.source.model.SManga
import eu.kanade.tachiyomi.source.online.HttpSource
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.CacheControl
import okhttp3.Dns
import okhttp3.Headers
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import rx.Observable
import rx.Single
import rx.schedulers.Schedulers
import uy.kohesive.injekt.Injekt
import uy.kohesive.injekt.api.get
import java.io.IOException
import java.security.MessageDigest

open class DoujinshiOne(private val suffix: String = "") : ConfigurableSource, UnmeteredSource, HttpSource() {
    override val baseUrl by lazy { getPrefBaseUrl() } // 服务器url

    override val lang = "all"

    override val name by lazy { "DoujinshiOne${getPrefCustomLabel()}" } // 实例显示名称

    override val supportsLatest = true // 支持latest

    private val randomCount by lazy { getPrefRandomCount() } // 随机个数

    private val apiKey by lazy { getPrefAPIKey() } // api key

    private val json by lazy { Injekt.get<Json>() }

    // //////////////////////////////
    // ////////doujinshi详情//////////
    // //////////////////////////////

    override fun fetchMangaDetails(manga: SManga): Observable<SManga> {
        val id = manga.url
        val uri = getApiUriBuilder("/doujinshi/$id/metadata").build()
        return client.newCall(GET(uri.toString(), headers))
            .asObservableSuccess()
            .map { mangaDetailsParse(it).apply { initialized = true } }
    }

    // 详情url和headers
    override fun mangaDetailsRequest(manga: SManga): Request {
        val id = manga.url
        val uri = getApiUriBuilder("/doujinshi/$id/metadata").build()
        return GET(uri.toString(), headers)
    }

    // 处理返回数据
    override fun mangaDetailsParse(response: Response): SManga {
        val doujinshi = json.decodeFromString<DoujinshiMetadata>(response.body.string()).data
        return doujinshiToSManga(doujinshi)
    }

    // //////////////////////////////
    // ////////doujinshi章节//////////
    // //////////////////////////////

    // 章节url和headers
    override fun chapterListRequest(manga: SManga): Request {
        val id = manga.url
        val uri = getApiUriBuilder("/doujinshi/$id/metadata").build()
        return GET(uri.toString(), headers)
    }

    // 章节数据处理
    override fun chapterListParse(response: Response): List<SChapter> {
        val doujinshi = json.decodeFromString<DoujinshiMetadata>(response.body.string()).data
        val uri = getApiUriBuilder("/doujinshi/${doujinshi.id}/pages") // 页面url
        return listOf(
            SChapter.create().apply {
                val uriBuild = uri.build()
                url = uriBuild.toString()
                chapter_number = 1F // 章节序号
                name = "Chapter" // 默认名称
            },
        )
    }

    // //////////////////////////////
    // ////////doujinshi页面//////////
    // //////////////////////////////

    // 页面url和headers
    override fun pageListRequest(chapter: SChapter): Request {
        return GET(chapter.url, headers)
    }

    // 页面数据处理
    override fun pageListParse(response: Response): List<Page> {
        val res_string = response.body.string()
        try {
            // 尝试解析为DoujinshiPage
            val doujinshiPage = json.decodeFromString<DoujinshiPage>(res_string)
            return doujinshiPage.data.mapIndexed { index, url ->
                val uri = getApiUriBuilder(url).build()
                Page(index, uri.toString(), uri.toString())
            }
        } catch (e: Exception) {
            // 如果失败，则尝试解析为 DoujinshiPage2
            val doujinshiPage = json.decodeFromString<DoujinshiPage2>(res_string)
            return doujinshiPage.data.urls.mapIndexed { index, url ->
                Page(
                    index,
                    url, // page url
                    // 储存headers信息（确保每页的imageUrl不同）
                    url + "|$|" + json.encodeToString(doujinshiPage.data.headers),
                )
            }
        }
    }

    // //////////////////////////////
    // ////////doujinshi图片//////////
    // //////////////////////////////

    // 未实现
    override fun imageUrlParse(response: Response) = throw UnsupportedOperationException()

    // 图片url和headers
    override fun imageRequest(page: Page): Request {
        if (page.url != page.imageUrl) { // web源结果
            // 读取headers
            val headers = json.decodeFromString<Map<String, String>>(page.imageUrl!!.split("|$|")[1])
            val imgHeadersBuilder = Headers.Builder()
            headers.forEach { (key, value) ->
                imgHeadersBuilder.add(key, value)
            }
            val imageHeaders = imgHeadersBuilder.build()
            return GET(page.url, imageHeaders)
        } else {
            if (page.url.contains("/pageinfo/")) { // web源单页
                val request = Request.Builder().url(page.url)
                    .headers(headers).build()
                val response = client.newCall(request).execute()
                // 获取单页图片url和headers
                val pageInfo = json.decodeFromString<DoujinshiPageInfo>(response.body.string())
                val imgHeadersBuilder = Headers.Builder()
                pageInfo.data.headers.forEach { (key, value) ->
                    imgHeadersBuilder.add(key, value)
                }
                val imageHeaders = imgHeadersBuilder.build()
                return GET(pageInfo.data.url, imageHeaders)
            } else {
                return GET(page.url, headers) // 默认
            }
        }
    }

    // //////////////////////////////
    // /////////popular实现///////////
    // //////////////////////////////

    // url和headers
    override fun popularMangaRequest(page: Int): Request {
        val uri = getApiUriBuilder("/doujinshi/random") // 随机
        uri.appendQueryParameter("num", randomCount.toString())
        return GET(uri.toString(), headers, CacheControl.FORCE_NETWORK)
    }

    // 结果处理
    override fun popularMangaParse(response: Response): MangasPage {
        return MangasPage(MangaParse(response).mangas, false)
    }

    // //////////////////////////////
    // /////////latest实现///////////
    // //////////////////////////////

    // url和headers
    override fun latestUpdatesRequest(page: Int): Request {
        val uri = getApiUriBuilder("/doujinshi")
        uri.appendQueryParameter("page", (-page).toString())
        return GET(uri.toString(), headers, CacheControl.FORCE_NETWORK)
    }

    // 结果处理
    override fun latestUpdatesParse(response: Response): MangasPage {
        return MangaParse(response)
    }

    // //////////////////////////////
    // /////////search实现///////////
    // //////////////////////////////

    // url和headers
    override fun searchMangaRequest(page: Int, query: String, filters: FilterList): Request {
        val uri = getApiUriBuilder("/search")
        // 筛选器
        filters.forEach { filter ->
            when (filter) {
                is SortSelect -> {
                    if (filter.toPart() == "1") {
                        uri.appendQueryParameter("page", page.toString())
                    } else {
                        uri.appendQueryParameter("page", (-page).toString())
                    }
                }
                is SourceSelect -> uri.appendQueryParameter("source_name", filter.toPart())
                is GroupSelect -> uri.appendQueryParameter("group", filter.toPart())
                else -> {}
            }
        }
        uri.appendQueryParameter("query", query)
        return GET(uri.toString(), headers, CacheControl.FORCE_NETWORK)
    }

    // 结果处理
    override fun searchMangaParse(response: Response): MangasPage {
        return MangaParse(response)
    }

    // //////////////////////////////
    // ////////////筛选器/////////////
    // //////////////////////////////

    // sort筛选器
    private class SortSelect(sort: Array<Pair<String?, String>>) : PartFilter("Sort", sort)

    // group筛选器
    private class GroupSelect(group: Array<Pair<String?, String>>) : PartFilter("Group", group)

    // source筛选器
    private class SourceSelect(source: Array<Pair<String?, String>>) : PartFilter("Source", source)

    // filter
    override fun getFilterList() = FilterList(
        SortSelect(listOf(Pair("0", "Descending"), Pair("1", "Ascending")).toTypedArray()),
        SourceSelect(getSourcePairs(sources)),
        GroupSelect(getGroupPairs(groups)),
    )

    // 筛选器变量
    private var groups = emptyList<Group>()
    private var sources = emptyList<String>()
    private var maxCount = 15 // 单页最大页数，15为默认值

    // 筛选器类
    open class PartFilter(displayName: String, private val vals: Array<Pair<String?, String>>) :
        Filter.Select<String>(displayName, vals.map { it.second }.toTypedArray()) {
        fun toPart() = vals[state].first
    }

    // 获取group
    private fun getGroups() {
        Single.fromCallable {
            client.newCall(GET(getApiUriBuilder("/group").toString(), headers)).execute()
        }
            .subscribeOn(Schedulers.io())
            .observeOn(Schedulers.io())
            .subscribe(
                {
                    groups = try {
                        json.decodeFromString<GroupResult>(it.body.string()).data
                    } catch (e: Exception) {
                        emptyList()
                    }
                },
                {},
            )
    }

    // 设置group筛选器变量
    private fun getGroupPairs(groups: List<Group>): Array<Pair<String?, String>> {
        getGroups()
        return listOf(Pair("", "All")) // 默认初始值
            .plus(
                groups
                    .map {
                        Pair(it.id, it.name)
                    },
            )
            .toTypedArray()
    }

    // 获取source
    private fun getSources() {
        Single.fromCallable {
            client.newCall(GET(getApiUriBuilder("/").toString(), headers)).execute()
        }
            .subscribeOn(Schedulers.io())
            .observeOn(Schedulers.io())
            .subscribe(
                { response ->
                    try {
                        val result = json.decodeFromString<ServerInfo>(response.body.string())
                        sources = result.sources.keys.toList()
                        maxCount = result.info.max_num_perpage
                    } catch (e: Exception) {
                        sources = emptyList()
                        maxCount = 15
                    }
                },
                { error ->
                    sources = emptyList()
                },
            )
    }

    // 设置source筛选器变量
    private fun getSourcePairs(sources: List<String>): Array<Pair<String?, String>> {
        getSources()
        return listOf(Pair("", "All")) // 默认初始值
            .plus(
                sources
                    .map {
                        Pair(it, it)
                    },
            )
            .toTypedArray()
    }

    // //////////////////////////////
    // ////////preferences//////////
    // //////////////////////////////

    override val id by lazy {
        // Retain previous ID for first entry
        val key = "doujinshione" + "_$suffix" + "/all/$versionId"
        val bytes = MessageDigest.getInstance("MD5").digest(key.toByteArray())
        (0..7).map { bytes[it].toLong() and 0xff shl 8 * (7 - it) }.reduce(Long::or) and Long.MAX_VALUE
    }

    internal val preferences: SharedPreferences by lazy {
        Injekt.get<Application>().getSharedPreferences("source_$id", 0x0000)
    }

    private fun getPrefBaseUrl(): String = preferences.getString(HOSTNAME_KEY, HOSTNAME_DEFAULT)!!
    private fun getPrefAPIKey(): String = preferences.getString(APIKEY_KEY, APIKEY_DEFAULT)!!
    private fun getPrefRandomCount(): Int = preferences.getString(RANDOM_COUNT, RANDOMCOUNT_DEFAULT)!!.toInt()
    private fun getPrefCustomLabel(): String = preferences.getString(CUSTOM_LABEL_KEY, suffix)!!.ifBlank { suffix }

    override fun setupPreferenceScreen(screen: androidx.preference.PreferenceScreen) {
        if (suffix == "") { // 若是第一个默认实例
            ListPreference(screen.context).apply {
                key = EXTRA_SOURCES_COUNT_KEY
                title = "Number of extra sources"
                summary = "Number of additional sources to create. There will always be at least one DoujinshiOne source."
                entries = EXTRA_SOURCES_ENTRIES
                entryValues = EXTRA_SOURCES_ENTRIES
                setDefaultValue(EXTRA_SOURCES_COUNT_DEFAULT)
                setOnPreferenceChangeListener { _, newValue ->
                    try {
                        val setting = preferences.edit().putString(EXTRA_SOURCES_COUNT_KEY, newValue as String).commit()
                        Toast.makeText(screen.context, "Restart Tachiyomi to apply new setting.", Toast.LENGTH_LONG).show()
                        setting
                    } catch (e: Exception) {
                        e.printStackTrace()
                        false
                    }
                }
            }.also(screen::addPreference)
        }
        screen.addPreference(screen.editTextPreference(HOSTNAME_KEY, "Hostname", HOSTNAME_DEFAULT, baseUrl, refreshSummary = true))
        screen.addPreference(screen.editTextPreference(APIKEY_KEY, "API Key", "", "Required to access the server.", true))
        screen.addPreference(screen.editTextPreference(RANDOM_COUNT, "Random count", RANDOMCOUNT_DEFAULT, "Count of doujinshis in random results", false, true))
        screen.addPreference(screen.editTextPreference(CUSTOM_LABEL_KEY, "Custom Label", "", "Show the given label for the source instead of the default."))
    }

    // 编辑框
    private fun androidx.preference.PreferenceScreen.editTextPreference(key: String, title: String, default: String, summary: String, isPassword: Boolean = false, isNumeric: Boolean = false, refreshSummary: Boolean = false): androidx.preference.EditTextPreference {
        return androidx.preference.EditTextPreference(context).apply {
            this.key = key
            this.title = title
            this.summary = summary
            this.setDefaultValue(default)

            setOnBindEditTextListener {
                it.inputType = when {
                    isPassword -> InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                    isNumeric -> InputType.TYPE_CLASS_NUMBER
                    else -> InputType.TYPE_CLASS_TEXT
                }
            }

            setOnPreferenceChangeListener { _, newValue ->
                try {
                    val newString = newValue.toString()
                    if (isNumeric && newString.toIntOrNull() == null) {
                        Toast.makeText(context, "Please enter a valid number.", Toast.LENGTH_SHORT).show()
                        return@setOnPreferenceChangeListener false
                    }
                    val res = preferences.edit().putString(this.key, newString).commit()
                    if (refreshSummary) {
                        this.summary = newValue as String
                    }
                    Toast.makeText(context, "Restart Tachiyomi to apply new setting.", Toast.LENGTH_LONG).show()
                    res
                } catch (e: Exception) {
                    e.printStackTrace()
                    false
                }
            }
        }
    }

    // //////////////////////////////
    // ////////////其他//////////////
    // //////////////////////////////

    // 处理doujinshi结果列表
    private fun MangaParse(response: Response): MangasPage {
        val jsonResult = json.decodeFromString<DoujinshiResult>(response.body.string())
        val doujinshis = arrayListOf<SManga>()
        jsonResult.data.map {
            doujinshis.add(doujinshiToSManga(it))
        }
        return MangasPage(doujinshis, doujinshis.size >= maxCount)
    }

    // 转换为doujinshi信息
    private fun doujinshiToSManga(doujinshi: Doujinshi): SManga {
        val smanga = SManga.create()
        smanga.url = doujinshi.id
        smanga.title = doujinshi.title
        smanga.description = ""
        smanga.thumbnail_url = getApiUriBuilder(doujinshi.cover).toString()
        val tags = if (doujinshi.translated_tags.isNullOrEmpty()) { // 是否翻译标签
            doujinshi.tags
        } else {
            doujinshi.translated_tags
        }
        var (artists, other_tags) = tags.partition { it.startsWith("artist:") } // 划分artist标签
        artists = artists.map { it.removePrefix("artist:") } // 获取artist
        other_tags = other_tags.map { it.substringAfter(":") } // 其他标签
        smanga.genre = other_tags.joinToString(", ")
        smanga.artist = artists.joinToString(", ")
        smanga.author = smanga.artist
        smanga.status = SManga.COMPLETED
        return smanga
    }

    // 生成headers
    override fun headersBuilder() = Headers.Builder().apply {
        if (apiKey.isNotEmpty()) {
            add("Authorization", "Bearer $apiKey")
        }
    }

    // 生成链接
    private fun getApiUriBuilder(path: String): Uri.Builder {
        return Uri.parse("$baseUrl$path").buildUpon()
    }

    // Headers (currently auth) are done in headersBuilder
    override val client: OkHttpClient = network.cloudflareClient.newBuilder()
        .dns(Dns.SYSTEM)
        .addInterceptor { chain ->
            val response = chain.proceed(chain.request())
            if (response.code == 401) throw IOException("If the server is in No-Fun Mode make sure the extension's API Key is correct.")
            response
        }
        .build()

    // 初始化
    init {
        if (baseUrl.isNotBlank()) {
            // 获取group和source
            getGroups()
            getSources()
        }
    }

    // 宏定义
    companion object {
        internal const val EXTRA_SOURCES_COUNT_KEY = "extraSourcesCount"
        internal const val EXTRA_SOURCES_COUNT_DEFAULT = "1"
        private val EXTRA_SOURCES_ENTRIES = (0..10).map { it.toString() }.toTypedArray()

        private const val HOSTNAME_DEFAULT = "http://127.0.0.1:9000"
        private const val HOSTNAME_KEY = "hostname"
        private const val APIKEY_KEY = "apiKey"
        private const val APIKEY_DEFAULT = "demo"
        private const val RANDOM_COUNT = "randomcount"
        private const val RANDOMCOUNT_DEFAULT = "5"
        private const val CUSTOM_LABEL_KEY = "customLabel"
    }
}

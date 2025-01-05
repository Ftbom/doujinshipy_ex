package eu.kanade.tachiyomi.extension.all.doujinshione

import eu.kanade.tachiyomi.source.Source
import eu.kanade.tachiyomi.source.SourceFactory

class DoujinshiOneFactory : SourceFactory {
    override fun createSources(): List<Source> {
        val firstLrr = DoujinshiOne("") // 第一个实例（默认）
        // 读取实例数目
        val doCount = firstLrr.preferences.getString(DoujinshiOne.EXTRA_SOURCES_COUNT_KEY, DoujinshiOne.EXTRA_SOURCES_COUNT_DEFAULT)!!.toInt()
        // 根据doCount创建实例
        return buildList(doCount) {
            add(firstLrr)
            for (i in 1..doCount) {
                add(DoujinshiOne(" $i"))
            }
        }
    }
}

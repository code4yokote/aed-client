Backbone.emulateHTTP = true
jQuery.support.cors = true

var apiBase = "https://api.cloud.appcelerator.com/v1/"
	, appKey = "JMWcUyfIFGRT3K7oBpkjzLdP98KMvCJq"

/**
 * @namespace Appネームスペース
 */
var InfoMap = {
	/**
	 * マップのID
	 */
	id: __infoMapId,//viewで定義される変数
	/**
	 * 選択中のポイント(InfoMap.model.Point) 
	 */
	_selectedPoint: null,

	currentPosition: null,
	sessionId: null,
	/**
	 * @namespace ユーティリティメソッド
	 */
	util: {
		/**
		 * collectionのcomparatorに使用する
		 * 日付昇順にソート
		 * @param {Date} p1
		 * @param {Date} p2
		 * @returns {Number} -1 or 1 
		 */
		comparatorDateAsc: function(p1, p2) {
			return p1.get("datetime") < p2.get("datetime") ? -1 : 1;
		},
		/**
		 * collectionのcomparatorに使用する
		 * 日付降順にソート
		 * @param {Date} p1
		 * @param {Date} p2
		 * @returns {Number} -1 or 1 
		 */
		comparatorDateDesc: function(p1, p2) {
			return p1.get("datetime") > p2.get("datetime") ? -1 : 1;
		},
		/**
		 * collectionのcomparatorに使用する
		 * 距離順にソート
		 * @param {Date} p1
		 * @param {Date} p2
		 * @returns {Number} -1 or 1 
		 */
		comparatorDistanceAsc: function(p1, p2) {
			var method = google.maps.geometry.spherical.computeDistanceBetween
				, p1pos = p1.marker.getPosition(), p2pos = p2.marker.getPosition()
				, currentpos = InfoMap.gmap.geoMarker.getPosition()
			return 	method(p1pos, currentpos) < method(p2pos, currentpos) ? -1 : 1;
		},
		/**
		 * ウィンドウに収まるように各要素の大きさを調整する
		 */
		fitWindow: function(){
			console.log($("#header").height())
			$("#content").height($(window).height()-$("#header").outerHeight())
			// InfoMap.elements.list.height($("#content").height()-InfoMap.elements.filter.height()-InfoMap.elements.sort.height())
			InfoMap.elements.list.height("100%")
		},
		/**
		 * コントロール要素を使用不能にする
		 */
		disableControls: function(){
			//InfoMap.controls.addClass("ui-disabled")
			InfoMap.elements.list.find(">li").addClass("ui-disabled")
			InfoMap.elements.filterControl.attr("disabled", "disabled").addClass("ui-disabled").selectmenu("refresh")
			InfoMap.elements.sortControl.attr("disabled", "disabled").addClass("ui-disabled").selectmenu("refresh")
		},
		/**
		 * コントロール要素を使用可能にする
		 */
		enableControls: function(){
			// InfoMap.controls.removeClass("ui-disabled")
			InfoMap.elements.list.find(">li").removeClass("ui-disabled")
			InfoMap.elements.filterControl.removeAttr("disabled").removeClass("ui-disabled").selectmenu("refresh")
			InfoMap.elements.sortControl.removeAttr("disabled").removeClass("ui-disabled").selectmenu("refresh")
		}
	}
}

/**
 * @namespace モデルクラス 
 */
InfoMap.model =	{
	Point: Backbone.Model.extend(/** @lends InfoMap.model.Point */{
		/**
		 * マップ上のポイントのデータ
		 * @constructs
		 * @class InfoMap.model.Point
		 * @extends Backbone.Model
		 * @requires backbone.js
		 */
		initialize: function(){
			var latlng = new google.maps.LatLng(this.get('latitude'), this.get('longitude'))
			
			/*
			 * リスト項目のビュー生成
			 */
			new InfoMap.view.PointList({model:this})
			
			/*
			 * マーカー設定
			 */
			this.marker = new google.maps.Marker({
				position: latlng,
				map: InfoMap.gmap.map,
				title: this.get('name'),
				shadow: InfoMap.gmap.markerShadow
			})
			google.maps.event.addListener(this.marker,"click",_.bind(function(){
				this.trigger('select')
			}, this))
			// google.maps.event.addListener(this.marker,"mouseover",function(){
				// this.setZIndex(6666)
			// })
			// google.maps.event.addListener(this.marker,"mouseout",function(){
				// this.setZIndex(null)
			// })
			
			/*
			 * オーバーレイ（情報ウィンドウ）設定
			 */
			this.overlay = new google.maps.InfoWindow({
				position: latlng,
				pixelOffset: new google.maps.Size(0,-37)
			})
			var infoWindowContent = new InfoMap.view.InfoWindowContent({model:this})//コンストラクタ中でInfoWindowのsetContentが行われる
			google.maps.event.addListener(this.overlay,"closeclick",_.bind(function(){
				this.trigger('deselect')
			}, this))
			
			/*
			 * 変更時の処理
			 */
			this.on('change', function(){
			})
			/*
			 * 削除時の処理
			 */
			this.on('destroy', function(){
				this.trigger('deselect')
				this.off()
				this.collection.remove(this).trigger('reset')
			}),
			/**
			 * リスト・マーカーで選択された時の処理
			 */
			this.on('select', function(){
				if(InfoMap._selectedPoint && this.id === InfoMap._selectedPoint.id) return//選択済みなら何もしない
				this.overlay.open(InfoMap.gmap.map)
				
				if(InfoMap._selectedPoint) {
					InfoMap._selectedPoint.trigger('deselect', _.bind(function(){
						InfoMap._selectedPoint = this
					}, this))
				} else {
					InfoMap._selectedPoint = this
				}
			})
			/*
			 * 選択解除された時の処理
			 */
			this.on('deselect', function(callback){
				this.overlay.close()
				InfoMap._selectedPoint = null
				if(callback && _.isFunction(callback)) callback()
			})
			/*
			 * 位置情報更新処理
			 */
			this.on('updateLocation', function(){
				var latlng = this.marker.getPosition(),
					api = "http://maps.googleapis.com/maps/api/geocode/json?latlng=" + latlng.lat() + "," + latlng.lng() + "&sensor=false"
				$.mobile.loading('show', {theme: 'b', textVisible: true, text: "保存中..."})
				this.save({
					lat: latlng.lat(),
					lng: latlng.lng()
				},{
					wait: true,
					success: function(mdl, atts) {
						mdl.trigger('disableLocationEditMode', {lat: atts.lat, lng: atts.lng})
						$.mobile.loading('hide')
					},
					error: function(mdl, xhr) {
						if(xhr.status == 401) {
							$("#alert-unauthorized").popup('open')
						}
						console.log(xhr)
						mdl.trigger('disableLocationEditMode')
						$.mobile.loading('hide')
					}
				})
			})
			/*
			 * 位置情報更新モードを有効にする
			 */
			this.on('enableLocationEditMode', function(){
				if(this != InfoMap._selectedPoint) return false
				this.overlay.close()
				_.each(InfoMap.gmap.store.marker, _.bind(function(m){
					if(m != this.marker) {
						m.setVisible(false)
					}
				}, this))//他のマーカーを非表示にする
				InfoMap.util.disableControls()
				if(InfoMap.gmap.map.getZoom() < 18) InfoMap.gmap.map.setZoom(18)
				InfoMap.gmap.map.panTo(this.marker.getPosition())
				this.marker.setDraggable(true)
				$("#location-edit-control").show()
			})
			/*
			 * 位置情報更新モードを無効にする
			 */
			this.on('disableLocationEditMode', function(update){
				var latlng = update ?
					new google.maps.LatLng(update.lat, update.lng) :
					new google.maps.LatLng(this.get('latitude'), this.get('longitude'))
				this.marker.setPosition(latlng)
				this.marker.setDraggable(false)
				this.overlay.setPosition(latlng)
				this.collection.trigger('reset')
				InfoMap.util.enableControls()
				$("#location-edit-control").hide()
			})
		}
	}),
	Status: Backbone.Model.extend(/** @lends InfoMap.model.Status */{
		/**
		 * ステータスのデータ
		 * @constructs
		 * @class InfoMap.model.Status
		 * @extends Backbone.Model
		 * @requires backbone.js
		 */
		initialize: function(){
			/*
			 * view(option要素)を生成
			 */
			new InfoMap.view.StatusFilter({model:this})
		},
		/**
		 * モデルのIDとして使用するキー 
		 */
		idAttribute: "value"
	})
},

/**
 * @namespace コレクションクラス
 */
InfoMap.collection = {
	Point: Backbone.Collection.extend(/** @lends InfoMap.collection.Point */{
		/**
		 * 
		 * @constructs
		 * @class InfoMap.collection.Point
		 * @extends Backbone.Collection
		 * @requires backbone.js
		 */
		initialize: function(){
			/*
			 * ポイントのリストが
			 */
			this.on('reset', function(){
				var visibleCount = 1,
					mcMarkers = [],
					selected = InfoMap._selectedPoint ? InfoMap._selectedPoint.id : null
				InfoMap.elements.list.empty()
				// InfoMap.gmap.mc.clearMarkers()
				_.each(InfoMap.gmap.store.marker, function(m) {
					m.setMap(null)
				})
				_.each(InfoMap.gmap.store.overlay, function(m) {
					m.setMap(null)
				})
				InfoMap.gmap.store.marker.length = 0
				InfoMap.gmap.store.overlay.length = 0
				if(selected) InfoMap._selectedPoint.trigger('deselect')
				this.each(function(mdl){
					// var statusModel = InfoMap.data.status.get(mdl.get("status"))
					var iconUrl = 
						'http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld='
						+ visibleCount + '|CC0000|FFFFFF'
					mdl.trigger('addlist', visibleCount)
					mdl.marker.setIcon(iconUrl)
					mdl.marker.setVisible(true)
					// mcMarkers.push(mdl.marker)
					InfoMap.gmap.store.marker.push(mdl.marker)
					InfoMap.gmap.store.overlay.push(mdl.overlay)
					if(selected == mdl.id) mdl.trigger('select')
					visibleCount++
				})
				// InfoMap.gmap.mc.addMarkers(mcMarkers)
				InfoMap.elements.list.listview('refresh')
			})
			this.on('remove', function(){
				//console.log("remove:")
			})
		},
		/**
		 * モデルクラス
		 * @default InfoMap.model.Point
		 */
		model: InfoMap.model.Point,
		/**
		 * APIのURL 
		 */
		url: apiBase + 'places/query.json?key=' + appKey,
		parse: function(res) {
			return res.response.places
		},
		/**
		 * ソート用関数
		 */
		comparator: InfoMap.util.comparatorDistanceAsc,
		/**
		 * statusでフィルターを行う
		 * @param {String} status ステータスID
		 */
		filterByStatus: function(status) {
			//if(status == this._currentFilter) return false
			InfoMap.data.point.fetch({
				data: {map_id: InfoMap.id, filter: status},
				cache: false,
				success: function(col, res, opt) {
				}
			})
			// this.each(function(mdl){
				// if(status == 0 || mdl.get("status") == status) {
					// mdl._filtered = false
				// } else {
					// mdl._filtered = true
				// }
			// })
			// this._currentFilter = status
			// if(InfoMap._selectedPoint && InfoMap._selectedPoint._filtered) InfoMap._selectedPoint.trigger('deselect')
			//this.trigger('reset')
		}
	}),
	
	Status: Backbone.Collection.extend(/** @lends InfoMap.collection.Status */{
		/**
		 * ステータスのコレクション
		 * @constructs
		 * @class InfoMap.collection.Status
		 * @extends Backbone.Collection
		 * @requires backbone.js
		 */
		initialize: function(){},
		/**
		 * モデルクラス 
		 */
		model: InfoMap.model.Status
	})
}

/**
 * @namespace ビュークラス 
 */
InfoMap.view = {
	PointList: Backbone.View.extend(/** @lends InfoMap.view.PointList */{
		/**
		 * ポイントリストの項目を生成（li要素）
		 * @constructs
		 * @class InfoMap.view.PointList
		 * @extends Backbone.View
		 * @requires backbone.js
		 */
		initialize: function(){
			this.$el.html(this.template(this.model.toJSON()))
			_.bindAll(this, "update", "destroy", "select", "deselect", "push")
			this.model.on('change', this.update)
			this.model.on('destroy', this.destroy)
			this.model.on('select', this.select)
			this.model.on('deselect', this.deselect)
			this.model.on('addlist', this.push)
		},
		tagName: 'li',
		events: {
			"click": function(){
				this.model.trigger('select')
			}
		},
		template: _.template($("#point-list-item").html()),//text()だとIEで動かない
		/*
		 * 内容の書き換え
		 */
		update: function(){
			var index = this.$(".list-index").text()
			this.$(".point-list-link").parent().html(this.template(this.model.toJSON()))
			this.$(".list-index").text(index)
			InfoMap.elements.list.listview("refresh")
			return this
		},
		/*
		 * モデル削除時の処理
		 */
		destroy: function(){
			this.undelegateEvents()
			delete this.model
		},
		/*
		 * 自身をリストビューに追加する
		 */
		push: function(number){
			this.delegateEvents(this.events)
			InfoMap.elements.list.append(this.$el)
			this.$(".list-index").text(number)
			return this
		},
		/*
		 * 選択時のビューに対する処理
		 */
		select: function(){
			this.$(".point-list-link").addClass("ui-btn-active")
			this.catchMe()
		},
		/*
		 * 選択解除時のビューに対する処理
		 */
		deselect: function(){
			this.$(".point-list-link").removeClass("ui-btn-active")
		},
		/*
		 * 自身が表示されるようにリストをスクロールする。
		 * スクロール不要の場合は何もしない。
		 */
		catchMe: function() {
			var position = this.$el.offset().top - InfoMap.elements.list.offset().top,
				scrollTo = InfoMap.elements.list.scrollTop() + position
			if(position > 0 && position < InfoMap.elements.list.height()) return
			InfoMap.elements.list.animate({
				scrollTop: scrollTo
			}, "fast")
		}
	}),
	
	InfoWindowContent: Backbone.View.extend(/** @lends InfoMap.view.InfoWindowContent */ {
		/**
		 * マップのInfoWindowの中身
		 * @constructs
		 * @class InfoMap.view.InfoWindowContent
		 * @extends Backbone.View
		 * @requires backbone.js
		 */
		initialize: function(){
			this.render()
			_.bindAll(this, "render")
			this.model.on('change', this.render)
		},
		/**
		 * <public> DOMイベント
		 */
		events: {
			"click .edit-button": "openForm",
			"click .location-edit": "enableLocationEditMode"
		},
		/**
		 * このviewのエレメントのタグ
		 */
		tagName: 'div',
		/**
		 * クラス
		 */
		className: 'info-window-inner',
		/**
		 * テンプレート 		 */
		template: _.template($("#info-window-content").html()),
		/**
		 * レンダリング処理 
		 */
		render: function(){
			this.$el.html(this.template(this.model.toJSON())).enhanceWithin()
			this.model.overlay.setContent(this.el)
		},
		/**
		 * フォーム
		 */
		openForm: function(){
			new InfoMap.view.ResponseForm({model: this.model})
		},
		enableLocationEditMode: function(){
			this.model.trigger('enableLocationEditMode')
		},
		/*
		 * 削除確認ダイアログを開く
		 * オープン時イベントハンドラを登録し、クローズ時に解除する
		 */
		deletionConfirm: function(){
			$("#deletion-confirm")
			.find(".btn").on('click', function(){
				$("#deletion-confirm").popup('close')
			}).end()
			.find(".delete-button").on('click', _.bind(function(){
				this.model.destroy({
					wait: true,
					error: function(mdl, xhr, opt){
						if(xhr.status == 401) {
							$("#alert-unauthorized").popup('open')
						}
					}
				})
			}, this)).end()
			.on('popupafterclose', function(){
				$(this).off().find(".btn").off()
			})
			.popup('open')
		}
	}),
	/*
	 * 編集フォーム
	 */
	ResponseForm: Backbone.View.extend({
		initialize: function(){
			this.$el.html(this.template(this.model.toJSON())).enhanceWithin()//Enhanceする
		},
		events: {
			// "click .cancel-button": function(){
			// 	this.$el.popup("close")
			// },
			"click .submit-button": function(){
				var serialized = this.$("form").serializeArray()
					, data = {}
					, cp = InfoMap.gmap.geoMarker.getPosition()
					, phone = this.model.get("phone_number").replace(/-/g, "")
					, custom_fields = {
						coordinates: [
							[cp.lng(), cp.lat()]
						],
						"[CUSTOM_Cities]city_id": this.model.get("custom_fields")["[CUSTOM_Cities]city_id"][0].id,
						status: 1
					}

				_.each(serialized, function(obj){
					data[obj.name] = obj.value
				})
				data.start_time = new Date()
				data.acl_name = this.model.get("custom_fields")["[CUSTOM_Cities]city_id"][0].name
				$.ajax({
					url: "http://maps.googleapis.com/maps/api/geocode/json",
					type: "GET",
					data: {
						latlng: cp.lat() + "," + cp.lng(),
						sensor: true
					}
					, beforeSend: function(){
						$.mobile.loading("show", {
							text: "位置情報を送信しています",
							textVisible: true,
							theme: "a"
						})
					}
				})
				.done(function(res){
					custom_fields.address = res.results[0].formatted_address
				})
				.then(function(res){
					data.custom_fields = JSON.stringify(custom_fields)
					$.ajax({
						url: "//aed-manager.herokuapp.com/manager/event/create",
						// url: "//192.168.0.37:3003/manager/event/create",
						type: "POST",
						data: data
					})
					.done(function(res){
						$.mobile.loading("hide")
						location.href = "tel:" + phone
					})
				})
				// this.model.save(data, {
				// 	wait: true,
				// 	success: function(mdl, res, opt) {
				// 		InfoMap.elements.filterControl.val(data.status).selectmenu("refresh").trigger("change")
				// 	},
				// 	error: function(mdl, xhr, opt) {
				// 		if(xhr.status == 401) {
				// 			$("#alert-unauthorized").popup('open')
				// 		}
				// 	}
				// })
				this.$el.panel("close")
			},
			//ポップアップを閉じたらlistenしないように
			"panelclose": function(){
				this.undelegateEvents()
			}
		},
		el: $("#response-form"),
		template: _.template($("#response-form-inner").html()),
		render: function(){
			
		}
	}),
	/*
	 * ステータス選択フィールドの項目
	 */
	StatusFilter: Backbone.View.extend({
		initialize: function(){
			this.$el.html(this.model.get('label')).appendTo(InfoMap.elements.filterControl)
		},
		tagName: 'option',
		attributes: function(){
			var atts = {value: this.model.get('value')}
			return atts
		}
	})
}

/**
 * アプリ初期化 
 */
var initialize = function(config) {
	InfoMap.config = config;
	$("#header-title").html(InfoMap.config.name)
	document.title = InfoMap.config.name
	InfoMap.elements = {
		list: $("#data-list"),
		filter: $("#data-filter"),
		filterControl: $("#filter-selector"),
		sort: $("#data-sorter"),
		sortControl: $("#sort-selector")
	}


	/*
	 * Google Map
	 */
	InfoMap.gmap = {
		map: new google.maps.Map(document.getElementById("map-canvas"), {
			zoom: InfoMap.config.initialZoom,
			center: new google.maps.LatLng(InfoMap.config.initialLat, InfoMap.config.initialLng),
			mapTypeId: google.maps.MapTypeId.ROADMAP,
			streetViewControl: false,
			styles: [
			  {
			    "featureType": "road",
			    "elementType": "geometry",
			    "stylers": [
			      { "visibility": "simplified" }
			    ]
			  },{
			    "featureType": "landscape",
			    "elementType": "labels",
			    "stylers": [
			      { "visibility": "off" }
			    ]
			  },{
			    "featureType": "poi",
			    "elementType": "labels.icon",
			    "stylers": [
			      { "visibility": "off" }
			    ]
			  },{
			    "featureType": "road",
			    "elementType": "labels",
			    "stylers": [
			      { "visibility": "off" }
			    ]
			  },{
			    "featureType": "transit.line",
			    "elementType": "labels",
			    "stylers": [
			      { "visibility": "off" }
			    ]
			  },{
			    "featureType": "landscape",
			    "elementType": "geometry",
			    "stylers": [
			      { "color": "#f3f6e8" }
			    ]
			  },{
			    "featureType": "poi",
			    "elementType": "geometry",
			    "stylers": [
			      { "hue": "#ddff00" },
			      { "saturation": 1 }
			    ]
			  },{
			    "featureType": "poi",
			    "elementType": "labels.text.fill",
			    "stylers": [
			      { "color": "#8e9880" }
			    ]
			  },{
			    "featureType": "road.highway",
			    "elementType": "geometry.fill",
			    "stylers": [
			      { "color": "#ffd07d" }
			    ]
			  },{
			    "featureType": "water",
			    "elementType": "geometry",
			    "stylers": [
			      { "saturation": -54 },
			      { "hue": "#00fff7" }
			    ]
			  },{
			    "featureType": "road.local",
			    "elementType": "geometry.fill",
			    "stylers": [
			      { "color": "#ffffff" }
			    ]
			  },{
			    "featureType": "administrative.country",
			    "stylers": [
			      { "visibility": "off" }
			    ]
			  }
			]
		}),
		markerShadow: new google.maps.MarkerImage(
			'http://chart.apis.google.com/chart?chst=d_map_pin_shadow',
			new google.maps.Size(40,37),
			new google.maps.Point(0,0),
			new google.maps.Point(10,37)
		),
		mc: new MarkerClusterer(null, [], {
			imagePath: InfoMap.config.markerDir,
			maxZoom: 15
		}),
		store: {
			marker: [],
			overlay: []
		}
	}
	// InfoMap.gmap.mc.setMap(InfoMap.gmap.map)
	
	/*
	 * Data Object (Instance of collection)
	 */
	InfoMap.data  = {
		point: new InfoMap.collection.Point(),
		status: new InfoMap.collection.Status()
	}
	
	/*
	 * DOM Event Handlers
	 */
	InfoMap.elements.sortControl.on('change', function(event, ui){
		if($(this).val() == 'ASC') {
			InfoMap.data.point.comparator = InfoMap.util.comparatorDateAsc
			InfoMap.data.point.sort()
		} else if($(this).val() == 'DESC') {
			InfoMap.data.point.comparator = InfoMap.util.comparatorDateDesc
			InfoMap.data.point.sort()
		}
	})
	InfoMap.elements.filterControl.on('change', function(){
		InfoMap.data.point.filterByStatus($(this).val())
	})
	$("#le-ok").on('click', function(){
		InfoMap._selectedPoint.trigger('updateLocation')
	})
	$("#le-cancel").on('click', function(){
		InfoMap._selectedPoint.trigger('disableLocationEditMode')
	})
	$("#reload-button").on('click', function(){
		console.log("curr")
		var pos = InfoMap.gmap.geoMarker.getPosition()
		InfoMap.gmap.map.setCenter(pos)
		InfoMap.data.point.fetch({
			data: {
				where: JSON.stringify({
					lnglat: {
						"$nearSphere": [pos.lng(), pos.lat()],
						"$maxDistance": 0.00124
					}
				})
			}
			, beforeSend: function(xhr) {
				$.mobile.loading("show", {
					text: "AED情報を取得しています",
					textVisible: true,
					theme: "a"
				})
			}
			, cache: false
			, success: function(col, res, opt) {
				$.mobile.loading("hide")
			}
		})
	})
	// $("#info-button").on('click', function(){
	// 	$("#popup-credit").popup('open')
	// })

	/*
	 * ステータス選択フィールドの初期化
	 */
	// _.each(InfoMap.config.status, function(s){
	// 	if(s !== undefined) {
	// 		InfoMap.data.status.add(s)
	// 	}
	// })
	// InfoMap.elements.filterControl.val(InfoMap.config.defaultFilter).selectmenu('refresh')
	
	/*
	 * データ取得
	 * collectionの
	 */
	InfoMap.gmap.geoMarker = new GeolocationMarker()
	google.maps.event.addListenerOnce(InfoMap.gmap.geoMarker, "position_changed", function(){
		var pos = this.getPosition()
		InfoMap.gmap.map.setCenter(pos)
		InfoMap.data.point.fetch({
			data: {
				where: JSON.stringify({
					lnglat: {
						"$nearSphere": [pos.lng(), pos.lat()],
						"$maxDistance": 0.00124,
						limit: 20
					}
				})
			}
			, beforeSend: function(xhr){
				$.mobile.loading("show", {
					text: "AED情報を取得しています",
					textVisible: true,
					theme: "a"
				})
			}
			, cache: false
			, success: function(col, res, opt) {
				$.mobile.loading("hide")
			}
		})
	})
	InfoMap.gmap.geoMarker.setMap(InfoMap.gmap.map)


	// InfoMap.gmap.geoMarker = new google.maps.Marker({
	// 	position: new google.maps.LatLng(config.initialLat, config.initialLng),
	// 	map: InfoMap.gmap.map,
	// 	title: "現在地",
	// 	shadow: InfoMap.gmap.markerShadow
	// })
}

// $(window)
// .on("resize", function(){
// 	InfoMap.util.fitWindow()
// })

/*
 * Launch App
 */
$(document)
.on("mobileinit", function(){
	$.mobile.loader.prototype.options.text = "位置情報を取得しています"
	$.mobile.loader.prototype.options.textVisible = true
	$.mobile.loader.prototype.options.theme = "a"
})
.on('pagecreate', "#map-page", function(){
	/*
	 * load config
	 */
	if(InfoMap && InfoMap.id) {
		initialize({
			"name": "現在地付近のAED設置場所",
			"baseUrl": "/",
			"imgDir": "/static/images",
			"markerDir": "/static/marker-images/",
			"initialLat": 0,
			"initialLng": 0,
			"initialZoom": 15,
			"defaultFilter":null
		});
		$.mobile.loading("show", {
			text: "位置情報を取得しています",
			textVisible: true,
			theme: "a"
		})
	}
})

// navigator.geolocation.watchPosition(
// 	function(pos) {
// 		InfoMap.gmap.geoMarker.setPosition(new google.maps.LatLng(pos.coords.latitude, pos.coords.longitude))
// 		InfoMap.data.point.fetch({
// 			data: {
// 				where: JSON.stringify({
// 					lnglat: {
// 						"$nearSphere": [pos.coords.longitude, pos.coords.latitude],
// 						"$maxDistance": 0.00124
// 					}
// 				})
// 			},
// 			cache: false
// 		})
// 	}
// )
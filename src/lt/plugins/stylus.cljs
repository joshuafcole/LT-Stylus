(ns lt.plugins.stylus
  (:require [clojure.string :as string]
            [lt.object :as object]
            [lt.objs.eval :as eval]
            [lt.objs.editor :as ed]
            [lt.objs.files :as files]
            [lt.objs.clients :as clients]
            [lt.objs.plugins :as plugins])
  (:require-macros [lt.macros :refer [behavior defui]]))

(def root-dir (plugins/find-plugin "Stylus"))
;; Require the cm-mode. We require it so that __dirname will be local (rather than nw-global) within the cm-stylus module.
(js/require (files/join root-dir "codemirror" "stylus"))
(def stylus (js/require (plugins/local-module "Stylus" "stylus")))

(behavior ::on-eval
          :triggers #{:eval
                      :eval.one}
          :reaction (fn [editor]
                      (object/raise stylus-lang :eval! {:origin editor
                                                     :info (assoc (@editor :info)
                                                             :code (ed/->val (:ed @editor)))})))

(behavior ::eval-on-save
          :triggers #{:save}
          :reaction (fn [editor]
                      (when-let [client (-> @editor :client :default)]
                        (when (and @client
                                   (not (clients/placeholder? client)))
                          (object/raise editor :eval)))))

(behavior ::eval!
          :triggers #{:eval!}
          :reaction (fn [this event]
                      (let [{:keys [info origin]} event
                            client (eval/get-client! {:command :editor.eval.css
                                                      :origin origin
                                                      :info info})
                            file-path (:path info)
                            code (.render stylus
                                            (:code info)
                                            (clj->js {:filename file-path}))]
                        (clients/send client
                                      :editor.eval.css
                                      (assoc info :code code)
                                      :only origin))))

(object/object* ::stylus-lang
                :tags #{}
                :behaviors [::eval!]
                :triggers #{:eval!})

(def stylus-lang (object/create ::stylus-lang))
